/**
 * Place all 244 lineup films on the same eight axes as the taste probe.
 *
 * This is the rubric. TMDB's genre list is far too coarse to separate "a doc
 * that plays like a thriller" from "a thriller about a documentarian", which is
 * exactly the edge case that matters at a festival — so the input is TIFF's own
 * programmer's note, which describes tone in the terms the axes are made of.
 *
 * Runs through the Batch API: 244 independent classifications with no ordering
 * between them is precisely what batch is for, at half the price. The axis
 * definitions and calibration anchors are identical on every request and sit in
 * a cached system prompt.
 *
 *   node scripts/assign-axes.mjs            # create and submit the batch
 *   node scripts/assign-axes.mjs --collect  # fetch results of the open batch
 */
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const OUT = "data/axes.json";
const BATCH_REF = "data/.axes-batch-id";
const MODEL = "claude-opus-5";

const films = JSON.parse(fs.readFileSync("data/films.json", "utf8"));
const synopses = JSON.parse(fs.readFileSync("data/synopses.json", "utf8"));
const probe = JSON.parse(fs.readFileSync("data/probe-films.json", "utf8"));

// Runtime is carried on screenings, not films — every screening of a film repeats it.
const screenings = JSON.parse(fs.readFileSync("data/screenings.json", "utf8"));
const runtimeById = new Map();
for (const s of screenings) if (s.runtime) runtimeById.set(s.film_id, s.runtime);

const client = new Anthropic();

const Axes = z.object({
  pace: z.number().min(-1).max(1),
  form: z.number().min(-1).max(1),
  genre: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  comedy: z.number().min(0).max(1),
  nonfiction: z.number().min(0).max(1),
  intl: z.number().min(0).max(1),
  duration: z.number().min(0).max(1),
  notability: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Independent of taste: how much this film would be a loss to miss — major director, significant premiere, festival centrepiece. Drives the Wildcard bucket.",
    ),
  confidence: z.number().min(0).max(1).describe("How well the note actually supports these placements."),
  rationale: z.string().max(240).describe("One sentence, concrete, quoting the note's own language where possible."),
});

const OutputFormat = zodOutputFormat(Axes);

// Calibration anchors. Without these the model invents its own scale per film and
// the lineup ends up incomparable to the probe, which breaks the whole projection.
const anchors = probe.films
  .map((f) => {
    const a = f.axes;
    return `  ${f.title} (${f.year}) — pace ${a.pace}, form ${a.form}, genre ${a.genre}, weight ${a.weight}, comedy ${a.comedy}, nonfiction ${a.nonfiction}, intl ${a.intl}, duration ${a.duration}`;
  })
  .join("\n");

const SYSTEM = `You place festival films on eight fixed axes so they can be compared against a viewer's taste.

The axes:
${Object.entries(probe.axes)
  .map(([k, v]) => `  ${k}: ${v}`)
  .join("\n")}

These films define the scale. Match their calibration exactly — a film you rate
"pace 0.9" must genuinely be as propulsive as Mad Max: Fury Road:

${anchors}

Rules that matter:
- Judge the film described, not the film you would expect from its genre. A
  documentary shot like a thriller is high genre and high nonfiction at once.
- "duration" is about endurance demanded, which correlates with runtime but is
  not the same thing — a taut 150 minutes is lower than a static 110.
- "intl" is about subtitles and cultural distance for an English-speaking
  audience, not the country of the production company.
- Programme is a strong prior: Wavelengths is formally experimental, Midnight
  Madness is heightened genre, TIFF Docs is nonfiction, Platform is auteur-driven.
  Let the note override the prior when they disagree.
- Set confidence low when the note is mostly plot summary with little sense of
  how the film actually plays.`;

const userContent = (film) => {
  const s = synopses[film.slug];
  const runtime = runtimeById.get(film.id) ?? null;
  return [
    `Title: ${film.title}`,
    `Programme: ${film.programme}`,
    film.directors ? `Director(s): ${film.directors}` : null,
    film.countries?.length ? `Countries: ${film.countries.join(", ")}` : null,
    film.languages?.length ? `Languages: ${film.languages.join(", ")}` : null,
    runtime ? `Runtime: ${runtime} min` : null,
    film.premium ? `Premium screening (red carpet / major premiere)` : null,
    "",
    "TIFF's programmer's note:",
    s?.synopsis ?? s?.teaser ?? "(none available — infer from the metadata above and lower your confidence accordingly)",
  ]
    .filter(Boolean)
    .join("\n");
};

// --one <slug>: run a single film synchronously and print it, to eyeball the
// rubric's output before committing to a 244-film batch.
const oneIdx = process.argv.indexOf("--one");
if (oneIdx !== -1) {
  const slug = process.argv[oneIdx + 1];
  const film = films.find((f) => f.slug === slug) ?? films[0];
  console.log(`--- ${film.title} [${film.programme}] ---\n`);

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: { format: OutputFormat, effort: "medium" },
    messages: [{ role: "user", content: userContent(film) }],
  });

  const text = res.content.find((b) => b.type === "text")?.text;
  console.log(JSON.stringify(JSON.parse(text), null, 2));
  console.log("\nusage:", JSON.stringify(res.usage));
  process.exit(0);
}

if (process.argv.includes("--collect")) {
  const batchId = fs.readFileSync(BATCH_REF, "utf8").trim();
  const batch = await client.messages.batches.retrieve(batchId);
  console.log(`batch ${batchId}: ${batch.processing_status}`);
  if (batch.processing_status !== "ended") {
    console.log("counts:", batch.request_counts);
    process.exit(0);
  }

  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  let ok = 0;
  let bad = 0;

  // Results come back in arbitrary order — key by custom_id, never by position.
  for await (const entry of await client.messages.batches.results(batchId)) {
    if (entry.result.type !== "succeeded") {
      console.log(`  ${entry.custom_id}: ${entry.result.type}`);
      bad++;
      continue;
    }
    const text = entry.result.message.content.find((b) => b.type === "text")?.text;
    try {
      out[entry.custom_id] = Axes.parse(JSON.parse(text));
      ok++;
    } catch (err) {
      console.log(`  ${entry.custom_id}: unparseable — ${err.message}`);
      bad++;
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\n${ok} films placed, ${bad} failed. -> ${OUT}`);
  process.exit(0);
}

const requests = films.map((film) => ({
  custom_id: film.slug,
  params: {
    model: MODEL,
    max_tokens: 2000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: { format: OutputFormat, effort: "medium" },
    messages: [{ role: "user", content: userContent(film) }],
  },
}));

const withNote = films.filter((f) => (synopses[f.slug]?.synopsis?.length ?? 0) > 300).length;
console.log(`submitting ${requests.length} films (${withNote} with a full note)`);

const batch = await client.messages.batches.create({ requests });
fs.writeFileSync(BATCH_REF, batch.id);
console.log(`batch ${batch.id} — ${batch.processing_status}`);
console.log(`collect with: node scripts/assign-axes.mjs --collect`);
