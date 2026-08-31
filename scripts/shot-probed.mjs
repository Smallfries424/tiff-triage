// Screenshot a route with a probe already answered, so the payoff screens can be
// reviewed in their real state rather than the empty gate.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const route = process.argv[2] ?? "/films";
const base = process.argv[3] ?? "http://localhost:3000";
const PORT = 9666;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const outDir = path.join(os.homedir(), "Downloads");

const REACTIONS = {
  "Mad Max: Fury Road": "love", "Uncut Gems": "love", "Everything Everywhere All at Once": "love",
  "Get Out": "love", "Hereditary": "like", "The Grand Budapest Hotel": "like",
  "The Tree of Life": "dislike", "Drive My Car": "dislike", "Aftersun": "dislike",
  "The Act of Killing": "unseen",
};

const chrome = spawn("flatpak", ["run","com.google.Chrome","--headless=new","--disable-gpu","--no-sandbox",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(os.tmpdir(),`tiff-shot2-${Date.now()}`)}`,
  `--user-agent=${UA}`, "about:blank"], { stdio: "ignore", detached: true });

const ws = await (async () => {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); return (await r.json()).webSocketDebuggerUrl; }
    catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error("no chrome");
})();

const browser = await puppeteer.connect({ browserWSEndpoint: ws });
const slug = (base.includes("localhost") ? "" : "live-") + (route.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home");

for (const theme of ["light", "dark"]) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
  // Seed before the app's first paint so it reads a populated probe.
  await page.evaluateOnNewDocument((r, plan) => {
    localStorage.setItem("tiff-probe-v1", JSON.stringify(r));
    if (plan.length) localStorage.setItem("tiff-plan-v1", JSON.stringify(plan));
  }, REACTIONS, ["26:1", "237:0", "165:0"]);
  await page.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 40000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 400));
  const file = path.join(outDir, `tiff-${slug}-${theme}.png`);
  await page.screenshot({ path: file });
  console.log(`${theme.padEnd(5)} -> ${file}`);
  await page.close();
}
await browser.close().catch(() => {});
try { process.kill(-chrome.pid, "SIGKILL"); } catch {}
