/**
 * Adjudicate the leftovers.
 *
 * After a scrape, some films have no note recorded. That is either a genuine gap
 * (shorts packages and talk events don't get a programmer's note) or the scraper
 * failing again. This loads each one in a fresh browser and reports what is
 * actually on the page, so the distinction is measured rather than assumed.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const PORT = 9555;

const films = JSON.parse(fs.readFileSync("data/films.json", "utf8"));
const synopses = JSON.parse(fs.readFileSync("data/synopses.json", "utf8"));

const thin = films.filter((f) => (synopses[f.slug]?.synopsis?.length ?? 0) < 300);
console.log(`${thin.length} film(s) without a recorded note\n`);
if (!thin.length) process.exit(0);

const chrome = spawn(
  "flatpak",
  [
    "run",
    "com.google.Chrome",
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), `tiff-verify-${Date.now()}`)}`,
    `--user-agent=${UA}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: true },
);

const ws = await (async () => {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Chrome did not come up");
})();

const browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: { width: 1440, height: 900 } });

const verdicts = { recovered: [], genuinelyEmpty: [], stillFailing: [] };

for (const f of thin) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  try {
    await page.goto(`https://www.tiff.net/films/${f.slug}`, { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 1200));

    const r = await page.evaluate(() => {
      const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
      const wrappers = [...document.querySelectorAll('[class*="style__pitch__"], [class*="style__notes__"]')];
      const paras = [];
      for (const w of wrappers) {
        for (const p of w.querySelectorAll("p")) {
          const t = clean(p.textContent);
          if (t.length > 80 && !paras.includes(t)) paras.push(t);
        }
      }
      // Every page on the site carries these two membership blurbs; they are not
      // editorial content and must not be mistaken for a note.
      const BOILERPLATE = /Patrons Circle or Contributors Circle Member/i;
      const longPs = [...document.querySelectorAll("p")]
        .map((p) => clean(p.textContent))
        .filter((t) => t.length > 80);

      return {
        title: clean(document.querySelector("h1")?.textContent),
        wrappers: wrappers.length,
        synopsis: paras.join("\n\n"),
        anyLongP: longPs.length,
        editorialParas: longPs.filter((t) => !BOILERPLATE.test(t)).length,
      };
    });

    if (r.synopsis.length >= 300) {
      // The page does have a note: record it and count the scrape as wrong.
      synopses[f.slug] = { ...(synopses[f.slug] ?? {}), synopsis: r.synopsis, paragraphs: r.synopsis.split("\n\n").length, recoveredAt: new Date().toISOString() };
      verdicts.recovered.push(`${f.slug} (${r.synopsis.length}ch)`);
    } else if (r.editorialParas === 0) {
      // No prose beyond the membership boilerplate every page carries. Shorts
      // packages and talk events use a template with no note at all. An absent
      // wrapper is the signal for that, not evidence the scrape failed.
      verdicts.genuinelyEmpty.push(`${f.slug} [${f.programme}]`);
    } else {
      verdicts.stillFailing.push(`${f.slug} (wrappers=${r.wrappers}, longPs=${r.anyLongP})`);
    }
  } catch (err) {
    verdicts.stillFailing.push(`${f.slug}: ${err.message}`);
  } finally {
    await page.close().catch(() => {});
  }
}

fs.writeFileSync("data/synopses.json", JSON.stringify(synopses, null, 2));

await browser.close().catch(() => {});
try {
  process.kill(-chrome.pid, "SIGKILL");
} catch {}

for (const [k, list] of Object.entries(verdicts)) {
  console.log(`\n${k}: ${list.length}`);
  for (const l of list) console.log(`   ${l}`);
}
