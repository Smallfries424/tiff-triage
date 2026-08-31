/**
 * Resolve the 15 probe films to TMDB and pull the fields the rubric can use.
 *
 * These are established, widely-seen films, so coverage here should be total —
 * which is exactly why this is the first TMDB call: a miss means the key or the
 * matching is wrong, not that the data is missing.
 */
import fs from "node:fs";

const KEY = process.env.TMDB_API_KEY;
if (!KEY) throw new Error("TMDB_API_KEY not set");
const BASE = "https://api.themoviedb.org/3";

const get = async (path, params = {}) => {
  const url = new URL(BASE + path);
  url.searchParams.set("api_key", KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${path}`);
  return r.json();
};

// Auth check first — cheapest possible call, and its failure is unambiguous.
try {
  const cfg = await get("/configuration");
  console.log("AUTH OK — image base:", cfg.images.secure_base_url, "\n");
} catch (e) {
  console.log("AUTH FAILED:", e.message);
  process.exit(1);
}

const probe = JSON.parse(fs.readFileSync("data/probe-films.json", "utf8"));
const out = {};
let missed = 0;

for (const film of probe.films) {
  const res = await get("/search/movie", { query: film.title, year: film.year });
  // Prefer an exact title match in the right year; the API's own ranking is
  // usually right but occasionally puts a documentary *about* the film first.
  const exact = res.results.find(
    (r) => r.title.toLowerCase() === film.title.toLowerCase() && (r.release_date ?? "").startsWith(String(film.year)),
  );
  const hit = exact ?? res.results[0];

  if (!hit) {
    console.log(`  MISS  ${film.title} (${film.year})`);
    missed++;
    continue;
  }

  const detail = await get(`/movie/${hit.id}`, { append_to_response: "keywords" });
  out[film.title] = {
    tmdbId: hit.id,
    title: detail.title,
    year: Number((detail.release_date ?? "").slice(0, 4)) || null,
    runtime: detail.runtime,
    genres: detail.genres.map((g) => g.name),
    keywords: (detail.keywords?.keywords ?? []).map((k) => k.name),
    voteAverage: detail.vote_average,
    originalLanguage: detail.original_language,
    poster: detail.poster_path,
  };

  const flag = exact ? " " : "~";
  console.log(
    `${flag} ${detail.title} (${out[film.title].year}) — ${detail.runtime}min, ${out[film.title].genres.join("/")}, ${out[film.title].keywords.length} keywords`,
  );
  await new Promise((r) => setTimeout(r, 120));
}

fs.writeFileSync("data/probe-tmdb.json", JSON.stringify(out, null, 2));
console.log(`\n${Object.keys(out).length}/${probe.films.length} resolved, ${missed} missed  ->  data/probe-tmdb.json`);
console.log('("~" marks a fuzzy match that used the API ranking rather than an exact title+year hit)');
