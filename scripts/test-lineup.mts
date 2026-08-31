// End-to-end: probe reactions -> taste vector -> the real 244-film lineup.
import fs from "node:fs";
import { scoreLineup, type AxisVector, type Reaction } from "../lib/scoring.ts";

const probe = JSON.parse(fs.readFileSync("data/probe-films.json", "utf8"));
const films = JSON.parse(fs.readFileSync("data/films.json", "utf8"));
const axes = JSON.parse(fs.readFileSync("data/axes.json", "utf8"));
const probeFilms = probe.films as { title: string; axes: AxisVector }[];

const lineup = films
  .filter((f: any) => axes[f.slug])
  .map((f: any) => ({
    id: f.id,
    title: `${f.title}  [${f.programme}]`,
    axes: axes[f.slug] as AxisVector,
    notability: axes[f.slug].notability,
    confidence: axes[f.slug].confidence,
  }));

const profiles: Record<string, Record<string, Reaction>> = {
  "wants to be dazzled": {
    "Mad Max: Fury Road": "love", "Uncut Gems": "love", "Everything Everywhere All at Once": "love",
    "Get Out": "love", Hereditary: "like",
    "The Tree of Life": "dislike", "Drive My Car": "dislike", Aftersun: "dislike",
  },
  "wants to be changed slowly": {
    "The Tree of Life": "love", "Drive My Car": "love", Aftersun: "love",
    "Portrait of a Lady on Fire": "love", "The Zone of Interest": "like", "Anatomy of a Fall": "like",
    "Mad Max: Fury Road": "dislike", "Uncut Gems": "dislike",
  },
  "documentary person": {
    "Free Solo": "love", "The Act of Killing": "love", "The Zone of Interest": "like",
    "Mad Max: Fury Road": "meh", Hereditary: "dislike", "Everything Everywhere All at Once": "dislike",
  },
};

for (const [label, reactions] of Object.entries(profiles)) {
  const { scored, confidence } = scoreLineup(reactions, probeFilms, lineup);
  const counts = scored.reduce((a: any, s) => ((a[s.verdict] = (a[s.verdict] ?? 0) + 1), a), {});
  console.log(`\n=== ${label} (confidence ${confidence.toFixed(2)}) ===`);
  console.log(`   yes ${counts.yes ?? 0} · maybe ${counts.maybe ?? 0} · wild ${counts.wild ?? 0} · no ${counts.no ?? 0}`);
  console.log("   top 6:");
  for (const s of scored.slice(0, 6)) console.log(`     ${String(s.fit).padStart(3)}  ${s.title}`);
  const wild = scored.filter((s) => s.verdict === "wild").slice(0, 2);
  if (wild.length) { console.log("   wildcards:"); for (const s of wild) console.log(`     ${String(s.fit).padStart(3)}  ${s.title}`); }
}
