// Screenshot a local route in both themes.
//   node scripts/shot.mjs /probe [outdir]
//
// Chrome here is the Flatpak build, which cannot write into the repo or /tmp
// scratchpad, so shots land in ~/Downloads unless told otherwise. Themes are
// switched with CDP media emulation rather than a Chrome flag, since
// prefers-color-scheme has no reliable command-line override.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const route = process.argv[2] ?? "/";
const outDir = process.argv[3] ?? path.join(os.homedir(), "Downloads");
const PORT = 9333;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

fs.mkdirSync(outDir, { recursive: true });

const chrome = spawn(
  "flatpak",
  [
    "run",
    "com.google.Chrome",
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), "tiff-shot-profile")}`,
    `--user-agent=${UA}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: true },
);

const wsUrl = await (async () => {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Chrome did not expose a debugging port");
})();

const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
const slug = route.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home";

for (const theme of ["light", "dark"]) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
  await page.goto(`http://localhost:3000${route}`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);

  const file = path.join(outDir, `tiff-${slug}-${theme}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`${theme.padEnd(5)} -> ${file}`);
  await page.close();
}

browser.disconnect();
process.kill(-chrome.pid);
