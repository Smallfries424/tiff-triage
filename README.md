# Festival Triage

**[tiff-triage.vercel.app](https://tiff-triage.vercel.app)**

TIFF programmes 244 films across eleven days. Nobody has seen any of them. That is what a festival
is. So the usual recommender trick of "films like ones you liked" has nothing to work with.

This app asks about fifteen films you *have* seen, and sorts the lineup from that.

---

## The problem, and why the obvious approach fails

An earlier version of this app probed with fifteen films **from the TIFF lineup itself**. Those are
unreleased premieres, so the answers were really only reactions to loglines. The probe measured
nothing.

The fix is to probe with established films and project that taste onto the unseen lineup. Both sets
then have to live in the same feature space, which is where the second problem appears.

**TMDB was the obvious source and it does not work.** Of the 244 films, 222 match a TMDB record, but
only 115 carry keywords and 89 a trailer: more than half the lineup would have had nothing to score
against. Its genres are also far too coarse: it files *The Tree of Life* as "Drama/Fantasy", which
says nothing about the most formally experimental film in the probe set.

**What works is TIFF's own programmer's notes.** They average 1,581 characters, name the director's
previous films, and describe how a film actually plays: "shameless sensationalism", "dances between
the macabre and the heartfelt". That is the vocabulary the axes are built from. Scraped for 237 of
244 films; the seven exceptions are shorts packages, for which TIFF publishes no note at all.

## How the sort works

Eight axes, chosen because they are what actually varies across a festival lineup:

`pace` · `form` · `genre` · `weight` · `comedy` · `nonfiction` · `intl` · `duration`

1. **Fifteen probe films** carry hand-authored loadings on those axes. They are picked to be
   *discriminating* rather than beloved. A film everyone likes carries no information. *Drive My
   Car* (three hours, quiet, subtitled) separates people more usefully than *The Godfather* does.
2. **Every lineup film** is placed on the same axes by an Opus 5 pass over its programmer's note,
   with the probe films supplied as calibration anchors so both sets share one scale.
3. **Reactions become a taste vector**, and fit is the agreement between it and each film.
4. **Verdicts** are cut relative to each viewer's own distribution, not at fixed thresholds.

### That the rubric works is checkable

Average the machine-assigned axes by TIFF programme and the festival's own curatorial structure
reappears, having never been supplied:

| Programme | form | pace | genre | nonfiction |
|---|---|---|---|---|
| Wavelengths (avant-garde) | **0.83** | **−0.64** | 0.09 | 0.40 |
| Midnight Madness | 0.40 | **0.56** | **0.73** | 0.10 |
| TIFF Docs | 0.27 | −0.02 | 0.11 | **1.00** |
| Gala Presentations | **−0.02** | 0.23 | 0.23 | 0.17 |

Confidence is calibrated too: 0.73 for films with a note, 0.14 for the seven without. The rubric
knows when it is guessing.

### Wildcard

A film your taste rejects, surfaced anyway because it is notable enough to gamble on. Without it the
app only ever confirms what you already like, which is the opposite of what a festival is for.

## Stack

Next.js 16 · TypeScript · Supabase (auth + Postgres + RLS) · Vercel

The lineup is a build-time static artifact. It is fixed for eleven days, so a database would add
latency and operations for nothing. Postgres holds only per-user state. Scoring runs client-side, so
changing an answer re-sorts all 244 films with no round trip.

Usable entirely signed out. Signing in only adds sync across devices, and merges rather than
replaces, so answering on a laptop and then signing in on a phone loses nothing.

## Data pipeline

```
scripts/match-slugs.mjs      244 films -> tiff.net URLs
scripts/scrape-synopses.mjs  programmer's notes
scripts/tmdb-probe.mjs       probe films -> TMDB
scripts/tmdb-lineup.mjs      lineup -> posters/trailers (exact matches only)
scripts/assign-axes.mjs      Batch API rubric pass -> data/axes.json
scripts/build-lineup.mjs     merge -> data/lineup.json
```

Outputs are committed, so the app builds without re-running any of it, with one exception.
`data/synopses.json` holds TIFF's programmer's notes verbatim and is **not** committed: that is
TIFF's editorial writing, not this project's data. It is read from disk rather than imported, so a
clone without it builds and runs; film pages simply omit the note and link to tiff.net instead. To
populate it locally, run `scripts/scrape-synopses.mjs`.

The one-line rationale under each film in the lineup is written in this project's own words, not
quoted from the note. It did quote, once. See the comment on `rationale` in `scripts/assign-axes.mjs`
and `scripts/paraphrase-rationales.mjs`, which rewrote all 237 that did.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in Supabase values
npm run dev
```

Only the Supabase variables are needed to run the app. The TMDB and Anthropic keys are for
regenerating data, which is already committed.

## License

The code is MIT. See [LICENSE](LICENSE).

That covers what this project wrote, which is not everything in the repository. The festival
schedule and lineup are TIFF's; posters, trailers and overviews under `data/*-tmdb.json` come from
[TMDB](https://www.themoviedb.org), which this project is not endorsed or certified by. Neither is
mine to sublicense, so the MIT grant does not reach them. If you fork this for another festival,
bring your own data and the code will be the useful part anyway.
