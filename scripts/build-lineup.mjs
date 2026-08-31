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

fs.writeFileSync("data/lineup.json", JSON.stringify(lineup));
const bytes = fs.statSync("data/lineup.json").size;
console.log(`${lineup.length} films -> data/lineup.json (${(bytes / 1024).toFixed(0)} KB)`);
console.log(`  with poster: ${lineup.filter((f) => f.poster).length}`);
console.log(`  with trailer: ${lineup.filter((f) => f.trailer).length}`);
console.log(`  screenings: ${lineup.reduce((n, f) => n + f.screenings.length, 0)}`);
