/**
 * Merge films + axes + screenings + TMDB into the one artifact the client needs.
 *
 * Deliberately excludes the programmer's notes: they are 376KB of prose used only
 * on a film's own page, which is server-rendered. Shipping them to score a list
 * would multiply the bundle for no gain.
 */
import fs from "node:fs";

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const films = read("data/films.json");
const axes = read("data/axes.json");
const screenings = read("data/screenings.json");
const tmdb = read("data/lineup-tmdb.json");

const byFilm = new Map();
for (const s of screenings) {
  if (!byFilm.has(s.film_id)) byFilm.set(s.film_id, []);
  byFilm.get(s.film_id).push({
    d: s.date,
    s: s.startLabel,
    e: s.endLabel,
    // Minutes from midnight. The labels are for humans; clash detection needs
    // numbers, and a late show can end past 24:00 so end may exceed 1440.
    st: s.start,
    en: s.end,
    v: s.venue,
    r: s.room,
    ev: s.evening ? 1 : 0,
    wk: s.weekend ? 1 : 0,
  });
}

const AX = ["pace", "form", "genre", "weight", "comedy", "nonfiction", "intl", "duration"];

const lineup = films.map((f) => {
  const a = axes[f.slug] ?? {};
  const t = tmdb[f.slug] ?? {};
  const scr = byFilm.get(f.id) ?? [];
  return {
    id: f.id,
    slug: f.slug,
    title: f.title,
    programme: f.programme,
    directors: f.directors ?? null,
    countries: f.countries ?? [],
    languages: f.languages ?? [],
    premium: f.premium ? 1 : 0,
    runtime: screenings.find((s) => s.film_id === f.id)?.runtime ?? null,
    axes: Object.fromEntries(AX.map((k) => [k, a[k] ?? 0])),
    notability: a.notability ?? 0,
    confidence: a.confidence ?? 0,
    why: a.rationale ?? null,
    noNote: f.noNotePublished ? 1 : 0,
    poster: t.matched && t.exact ? (t.poster ?? null) : null,
    trailer: t.matched && t.exact ? (t.trailerKey ?? null) : null,
    screenings: scr,
    // Precomputed so the browse filters never have to walk screenings.
    nEvening: scr.filter((s) => s.ev).length,
    nWeekend: scr.filter((s) => s.wk).length,
    nPrime: scr.filter((s) => s.ev && s.wk).length,
    firstDate: scr[0]?.d ?? null,
  };
});

// ---- "more like this" -------------------------------------------------------
//
// Nearest neighbours in the same eight-dimensional space the rubric uses. This is
// deliberately taste-independent: similarity is a property of the films, so two
// viewers see the same neighbours and only the fit badge differs.
//
// The two bipolar axes (pace, form) span -1..1 while the rest span 0..1, so they
// are rescaled first. Otherwise they would count double in the distance and
// "similar" would mostly mean "similar pace".
const norm = (f) =>
  AX.map((k) => {
    const v = f.axes[k] ?? 0;
    return k === "pace" || k === "form" ? (v + 1) / 2 : v;
  });

const vectors = new Map(lineup.map((f) => [f.id, norm(f)]));

// Films whose own placement was a guess (the shorts packages, ~0.15) should not
// be recommended: suggesting a film we could not read is worse than suggesting
// nothing. They still receive recommendations.
const RECOMMENDABLE_CONFIDENCE = 0.4;

// Traits worth naming when two films share them, in the words the cards use.
const TRAIT = {
  genre: "heightened genre",
  comedy: "comic",
  weight: "heavy",
  nonfiction: "documentary",
  intl: "subtitled",
  duration: "a long sit",
};

for (const film of lineup) {
  const a = vectors.get(film.id);

  const scored = lineup
    .filter((o) => o.id !== film.id && o.confidence >= RECOMMENDABLE_CONFIDENCE)
    .map((o) => {
      const b = vectors.get(o.id);
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
      return { id: o.id, d: Math.sqrt(sum) };
    })
    .sort((x, y) => x.d - y.d)
    .slice(0, 5);

  film.similar = scored.map((s) => {
    const other = lineup.find((o) => o.id === s.id);
    // Name up to two traits both films lean into, so the suggestion says why.
    const shared = Object.entries(TRAIT)
      .filter(([k]) => (film.axes[k] ?? 0) >= 0.55 && (other.axes[k] ?? 0) >= 0.55)
      .map(([, label]) => label)
      .slice(0, 2);
    if (!shared.length && film.axes.pace < -0.3 && other.axes.pace < -0.3) shared.push("unhurried");
    if (!shared.length && film.axes.pace > 0.3 && other.axes.pace > 0.3) shared.push("propulsive");
    if (!shared.length && film.axes.form > 0.5 && other.axes.form > 0.5) shared.push("formally bold");
    return { id: s.id, shared };
  });
}

fs.writeFileSync("data/lineup.json", JSON.stringify(lineup));
const bytes = fs.statSync("data/lineup.json").size;
console.log(`${lineup.length} films -> data/lineup.json (${(bytes / 1024).toFixed(0)} KB)`);
console.log(`  with poster: ${lineup.filter((f) => f.poster).length}`);
console.log(`  with trailer: ${lineup.filter((f) => f.trailer).length}`);
console.log(`  screenings: ${lineup.reduce((n, f) => n + f.screenings.length, 0)}`);
console.log(`  recommendable: ${lineup.filter((f) => f.confidence >= RECOMMENDABLE_CONFIDENCE).length}/244`);
const sample = lineup.find((f) => f.slug === "bad-lieutenant-tokyo") ?? lineup[0];
console.log(`\n  e.g. ${sample.title}:`);
for (const s of sample.similar) {
  const o = lineup.find((f) => f.id === s.id);
  console.log(`     ${o.title.padEnd(34)} ${s.shared.join(", ") || "(close overall)"}`);
}
