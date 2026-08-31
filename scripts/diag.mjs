// Why does a page that renders fine under --dump-dom come back empty in the
// scraper? Loads one film four ways and reports what each produces.
import puppeteer from "puppeteer-core";

const SLUG = process.argv[2] ?? "stuffed";
const URL = `https://www.tiff.net/films/${SLUG}`;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: { width: 1440, height: 900 },
});

const probe = async (label, { block, wait }) => {
  const page = await browser.newPage();
  await page.setUserAgent(UA);

  if (block.length) {
    await page.setRequestInterception(true);
    page.on("request", (r) => (block.includes(r.resourceType()) ? r.abort() : r.continue()));
  }

  await page.goto(URL, { waitUntil: wait, timeout: 45000 }).catch((e) => console.log("  goto:", e.message));

  const out = await page.evaluate(() => {
    const wrappers = document.querySelectorAll('[class*="style__pitch__"], [class*="style__notes__"]');
    const longPs = [...document.querySelectorAll("p")]
      .map((p) => (p.textContent ?? "").trim().length)
      .filter((n) => n > 80);
    return {
      wrappers: wrappers.length,
      longPs,
      bodyLen: document.body.innerHTML.length,
      title: document.title,
    };
  });

  console.log(
    `${label.padEnd(34)} wrappers=${out.wrappers}  longPs=[${out.longPs}]  body=${out.bodyLen}  "${out.title}"`,
  );
  await page.close();
};

await probe("no blocking, networkidle2", { block: [], wait: "networkidle2" });
await probe("block img/font/media", { block: ["image", "font", "media"], wait: "networkidle2" });
await probe("block +stylesheet (scraper)", { block: ["image", "font", "media", "stylesheet"], wait: "networkidle2" });
await probe("block +stylesheet, domcontentload", {
  block: ["image", "font", "media", "stylesheet"],
  wait: "domcontentloaded",
});

browser.disconnect();
