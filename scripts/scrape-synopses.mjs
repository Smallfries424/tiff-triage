// Scrape each lineup film's programmer's note off tiff.net.
//
// tiff.net sits behind an AWS WAF that answers plain HTTP clients with an empty
// 202 and blocks stock headless Chrome outright, so this drives one real Chrome
// over CDP with a normal user-agent and reuses the session across all 244 pages.
// Writes incrementally and skips what it already has, so it is safe to re-run
// after a crash or a partial pass.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const OUT = "data/synopses.json";
const DELAY_MS = 900;
const PORT = 9444;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

// A single Chrome starts returning empty notes after roughly 50 films — the page
// loads, the DOM is there, but the note never paints. Recycling the whole browser
// process on a fixed interval is the only thing that reliably clears it.
const RECYCLE_EVERY = 40;

// The note is client-rendered, so a record can come back empty purely on timing.
// --retry-thin re-runs only those rather than the whole lineup.
const RETRY_THIN = process.argv.includes("--retry-thin");
const isThin = (r) => !r?.synopsis || r.synopsis.length < 300;

const films = JSON.parse(fs.readFileSync("data/films.json", "utf8"));
const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const todo = films.filter((f) => f.slug && (RETRY_THIN ? isThin(done[f.slug]) : !done[f.slug]));

console.log(`${Object.keys(done).length} already scraped, ${todo.length} to ${RETRY_THIN ? "retry" : "go"}`);
if (!todo.length) process.exit(0);

let chrome = null;
let browser = null;
// Each generation gets its own port. `flatpak run` is a wrapper, so killing the
// pid we spawned does not reliably reach the sandboxed Chrome — an old instance
// can outlive its kill and keep holding the port, at which point the "new"
// browser never binds and puppeteer silently reconnects to the dead one. That is
// exactly the failure that looked like page-level flakiness. A fresh port makes
// a survivor harmless instead of invisible.
let generation = 0;

const startBrowser = async () => {
  const port = PORT + (generation++ % 50);
  chrome = spawn(
    "flatpak",
    [
      "run",
      "com.google.Chrome",
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${path.join(os.tmpdir(), `tiff-scrape-${Date.now()}`)}`,
      `--user-agent=${UA}`,
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  );

  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      browser = await puppeteer.connect({
        browserWSEndpoint: (await r.json()).webSocketDebuggerUrl,
        defaultViewport: { width: 1440, height: 900 },
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Chrome did not come up on port ${port}`);
};

const stopBrowser = async () => {
  // close(), not disconnect() — disconnect detaches and deliberately leaves the
  // browser running, which is how generations piled up in the first place.
  try {
    await browser?.close();
  } catch {}
  try {
    if (chrome?.pid) process.kill(-chrome.pid, "SIGKILL");
  } catch {}
  browser = null;
  chrome = null;
  await new Promise((r) => setTimeout(r, 1500));
};

// A page is opened and closed per film rather than reused. Reusing one page
// across many navigations with request interception attached silently returned
// empty notes for about a third of them — networkidle2 resolving against the
// previous document — while a fresh page is reliable.
const newPage = async () => {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  // Images and fonts are ~90% of the bytes here and none of them are being read.
  await page.setRequestInterception(true);
  page.on("request", (r) =>
    ["image", "font", "media", "stylesheet"].includes(r.resourceType()) ? r.abort() : r.continue(),
  );
  return page;
};

await startBrowser();

const extract = () => {
  const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  const meta = (sel) => document.querySelector(sel)?.getAttribute("content") ?? null;

  // The note lives in style__pitch___* / style__notes___* wrappers whose hashes
  // change on every build, so match the stable prefix rather than the full class.
  const wrappers = [...document.querySelectorAll('[class*="style__pitch__"], [class*="style__notes__"]')];
  const paras = [];
  for (const w of wrappers) {
    for (const p of w.querySelectorAll("p")) {
      const t = clean(p.textContent);
      if (t.length > 80 && !paras.includes(t)) paras.push(t);
    }
  }

  return {
    title: clean(document.querySelector("h1")?.textContent) || null,
    synopsis: paras.join("\n\n") || null,
    paragraphs: paras.length,
    teaser: meta('meta[property="og:description"]'),
    still: meta('meta[property="og:image"]'),
    pageId: meta('meta[name="pageID"]'),
    trailer:
      [...document.querySelectorAll('a[href*="youtube"], a[href*="youtu.be"], iframe[src*="youtube"]')]
        .map((e) => e.getAttribute("href") || e.getAttribute("src"))
        .find(Boolean) ?? null,
  };
};

let ok = 0;
let thin = 0;

for (const [i, f] of todo.entries()) {
  if (i > 0 && i % RECYCLE_EVERY === 0) {
    await stopBrowser();
    await startBrowser();
    console.log(`   -- recycled Chrome after ${i} films --`);
  }

  const url = `https://www.tiff.net/films/${f.slug}`;
  const page = await newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    // Some pages genuinely carry no note, so absence is not treated as an error.
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('[class*="style__pitch__"] p, [class*="style__notes__"] p')].some(
            (p) => (p.textContent ?? "").trim().length > 80,
          ),
        { timeout: 12000 },
      )
      .catch(() => {});
    const rec = await page.evaluate(extract);
    done[f.slug] = { ...rec, url, filmId: f.id, scrapedAt: new Date().toISOString() };

    const n = rec.synopsis?.length ?? 0;
    if (n > 300) ok++;
    else thin++;
    console.log(`${String(i + 1).padStart(3)}/${todo.length}  ${n ? String(n).padStart(5) : "  ---"}ch  ${f.slug}`);
  } catch (err) {
    done[f.slug] = { url, filmId: f.id, error: String(err.message ?? err) };
    thin++;
    console.log(`${String(i + 1).padStart(3)}/${todo.length}  FAIL     ${f.slug}  ${err.message}`);
  } finally {
    await page.close().catch(() => {});
  }

  fs.writeFileSync(OUT, JSON.stringify(done, null, 2));
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

await stopBrowser();
console.log(`\ndone. ${ok} with a real synopsis, ${thin} thin or failed.`);
