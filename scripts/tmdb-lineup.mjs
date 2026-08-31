/**
 * Match the 244 lineup films to TMDB for trailers, posters and stills.
 *
 * This is the coverage question I flagged early on and never actually measured:
 * 2026 premieres often have thin or absent TMDB records. The rubric no longer
 * depends on the answer (it runs off TIFF's notes), so a miss here costs a
 * trailer, not a verdict. Writes incrementally and is safe to re-run.
 */
import fs from "node:fs";

const KEY = process.env.TMDB_API_KEY;
if (!KEY) throw new Error("TMDB_API_KEY not set");
const BASE = "https://api.themoviedb.org/3";
const OUT = "data/lineup-tmdb.json";

const get = async (path, params = {}) => {
  const url = new URL(BASE + path);
  url.searchParams.set("api_key", KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url);
    if (r.status === 429) {
      // TMDB returns Retry-After on throttle; respect it rather than hammering.
      const wait = Number(r.headers.get("retry-after") ?? 2) * 1000;
      await new Promise((res) => setTimeout(res, wait + 250));
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} on ${path}`);
    return r.json();
  }
  throw new Error(`throttled repeatedly on ${path}`);
};

const norm = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const films = JSON.parse(fs.readFileSync("data/films.json", "utf8"));
const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const todo = films.filter((f) => !(f.slug in done));
console.log(`${Object.keys(done).length} already matched, ${todo.length} to go\n`);

let exact = 0;
let fuzzy = 0;
let miss = 0;

for (const [i, film] of todo.entries()) {
  try {
    // Festival premieres are 2026 releases, but TMDB often lists them a year out
    // either side, so year is a ranking hint rather than a filter.
    const res = await get("/search/movie", { query: film.title });
    const cands = res.results ?? [];
    const target = norm(film.title);

    const exactHit = cands.find((c) => norm(c.title) === target || norm(c.original_title ?? "") === target);
    const hit = exactHit ?? cands[0];

    if (!hit) {
      done[film.slug] = { matched: false };
      miss++;
      console.log(`${String(i + 1).padStart(3)}  MISS   ${film.title}`);
    } else {
      const detail = await get(`/movie/${hit.id}`, { append_to_response: "videos,keywords" });
      const trailer =
        (detail.videos?.results ?? []).find((v) => v.site === "YouTube" && v.type === "Trailer") ??
        (detail.videos?.results ?? []).find((v) => v.site === "YouTube");

      done[film.slug] = {
        matched: true,
        exact: Boolean(exactHit),
        tmdbId: hit.id,
        title: detail.title,
        year: Number((detail.release_date ?? "").slice(0, 4)) || null,
        runtime: detail.runtime || null,
        genres: (detail.genres ?? []).map((g) => g.name),
        keywords: (detail.keywords?.keywords ?? []).map((k) => k.name),
        overview: detail.overview || null,
        poster: detail.poster_path,
        backdrop: detail.backdrop_path,
        trailerKey: trailer?.key ?? null,
      };
      if (exactHit) exact++;
      else fuzzy++;
      console.log(
        `${String(i + 1).padStart(3)}  ${exactHit ? "exact" : "fuzzy"}  ${film.title}${trailer ? "  [trailer]" : ""}`,
      );
    }
  } catch (err) {
    done[film.slug] = { matched: false, error: String(err.message) };
    miss++;
    console.log(`${String(i + 1).padStart(3)}  ERR    ${film.title} — ${err.message}`);
  }

  fs.writeFileSync(OUT, JSON.stringify(done, null, 2));
  await new Promise((r) => setTimeout(r, 110));
}

console.log(`\nexact ${exact}, fuzzy ${fuzzy}, missed ${miss}`);
