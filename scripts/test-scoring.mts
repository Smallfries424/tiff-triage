// Sanity check: do two opposed viewers get opposed lineups?
// Run: node --experimental-strip-types scripts/test-scoring.mts
import fs from "node:fs";
import { AXES, scoreLineup, tasteVector, type AxisVector, type Reaction } from "../lib/scoring.ts";

const probe = JSON.parse(fs.readFileSync("data/probe-films.json", "utf8"));
const probeFilms = probe.films as { title: string; axes: AxisVector }[];

const react = (pairs: Record<string, Reaction>): Record<string, Reaction> => pairs;

// Someone who wants to be dazzled and kept moving.
const propulsive = react({
  "Mad Max: Fury Road": "love",
  "Uncut Gems": "love",
  "Everything Everywhere All at Once": "love",
  Hereditary: "like",
  "Get Out": "love",
  "The Tree of Life": "dislike",
  "Drive My Car": "dislike",
  Aftersun: "dislike",
  "Portrait of a Lady on Fire": "meh",
});

// Someone who wants to sit in the dark and be changed slowly.
const contemplative = react({
  "The Tree of Life": "love",
  "Drive My Car": "love",
  Aftersun: "love",
  "Portrait of a Lady on Fire": "love",
  "The Zone of Interest": "like",
  "Anatomy of a Fall": "like",
  "Mad Max: Fury Road": "dislike",
  "Uncut Gems": "dislike",
  "Everything Everywhere All at Once": "meh",
});

for (const [label, reactions] of [
  ["propulsive", propulsive],
  ["contemplative", contemplative],
] as const) {
  const { taste, answered, confidence } = tasteVector(reactions, probeFilms);
  console.log(`\n=== ${label}  (answered ${answered}, confidence ${confidence.toFixed(2)}) ===`);
  for (const a of AXES) console.log(`  ${a.padEnd(11)} ${taste[a] >= 0 ? " " : ""}${taste[a].toFixed(2)}`);
}

// With no lineup vectors yet, score the probe films against themselves: a viewer
// should rank the films they loved at the top. If that fails, the math is wrong.
const asLineup = probeFilms.map((f, i) => ({ id: i, title: f.title, axes: f.axes }));

for (const [label, reactions] of [
  ["propulsive", propulsive],
  ["contemplative", contemplative],
] as const) {
  const { scored } = scoreLineup(reactions, probeFilms, asLineup);
  console.log(`\n=== ${label}: own probe films ranked ===`);
  for (const s of scored.slice(0, 5)) console.log(`  ${String(s.fit).padStart(3)}  ${s.title}`);
  console.log("  ...");
  for (const s of scored.slice(-3)) console.log(`  ${String(s.fit).padStart(3)}  ${s.title}`);
}
