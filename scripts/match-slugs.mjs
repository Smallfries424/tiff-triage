// Match our 244 lineup films to their tiff.net /films/<slug> pages.
// TIFF strips apostrophes rather than treating them as separators, which is the
// only rule that isn't obvious from looking at a couple of URLs.
import fs from "node:fs";

const INDEX = process.argv[2];
const html = fs.readFileSync(INDEX, "utf8");
const slugs = new Set([...html.matchAll(/href="\/films\/([a-z0-9-]+)"/g)].map((m) => m[1]));

export const slugify = (t) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // dropped outright rather than treated as word breaks: "The Idiot(s)" is
    // the-idiots, "F*ck" is fck, "Ba's Book" is bas-book
    .replace(/['‘’"()*]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// TIFF's own slugs aren't perfectly consistent, so a couple need pinning:
// Ben'Imana breaks at the apostrophe (unlike every other title), and Strong Son
// collides with an existing page and got a -2 suffix.
const OVERRIDES = {
  "Ben'Imana": "ben-imana",
  "Strong Son": "strong-son-2",
};

const films = JSON.parse(fs.readFileSync("data/films.json", "utf8"));
const missed = [];

for (const f of films) {
  const s = OVERRIDES[f.title] ?? slugify(f.title);
  if (slugs.has(s)) f.slug = s;
  else missed.push([f, s]);
}

console.log(`slug match: ${films.length - missed.length}/${films.length}`);

if (missed.length) {
  console.log("\nunmatched:");
  for (const [f, s] of missed) {
    const stem = s.split("-").find((w) => w.length > 3) ?? s;
    const near = [...slugs].filter((x) => x.includes(stem)).slice(0, 3);
    console.log(`  ${f.title}\n    guessed: ${s}\n    near:    ${near.join(", ") || "(nothing)"}`);
  }
}

fs.writeFileSync("data/films.json", JSON.stringify(films, null, 2));
