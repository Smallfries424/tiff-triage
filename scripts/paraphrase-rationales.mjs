/**
 * Rewrite the axis rationales so they carry none of TIFF's own wording.
 *
 * The original rubric asked for a sentence "quoting the note's own language where
 * possible", which made the rationales vivid and made them TIFF's writing. 237 of
 * 244 came back with quoted fragments in them, and those rationales ship to the
 * browser as the `why` line on every card, so publishing this repo would publish
 * TIFF's editorial prose, which is exactly what data/synopses.json is gitignored
 * to avoid.
 *
 * This rewrites each one to say the same thing in our own words. Dropping the
 * quote marks alone would be worse than useless: it would keep their sentences and
 * hide that they were theirs. So the check that matters is not "are there quote
 * characters" but "is any run of words lifted verbatim", and that is what
 * validate() enforces.
 *
 * The axis scores are not touched. Only the rationale string changes.
 *
 *   node scripts/paraphrase-rationales.mjs --one <slug>   # eyeball one
 *   node scripts/paraphrase-rationales.mjs --dry          # rewrite, write nothing
 *   node scripts/paraphrase-rationales.mjs                # rewrite and save
 */
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const AXES = "data/axes.json";
const MODEL = "claude-opus-5";
const CONCURRENCY = 6;
/** Shortest run of identical words that counts as lifted rather than coincidental. */
const NGRAM = 6;

const axes = JSON.parse(fs.readFileSync(AXES, "utf8"));
const synopses = JSON.parse(fs.readFileSync("data/synopses.json", "utf8"));
const films = JSON.parse(fs.readFileSync("data/films.json", "utf8"));
const bySlug = new Map(films.map((f) => [f.slug, f]));

const client = new Anthropic();

// Two schemas on purpose. The API is told the 240 limit so the model aims under it,
// but the response is parsed without it: an over-long sentence is a thing to say
// "too long, try again" about, not an exception that ends the film's retries.
const Rewrite = z.object({
  rationale: z
    .string()
    .max(240)
    .describe("One sentence in your own words. No quotation marks, no phrases lifted from the note."),
});
const Lenient = z.object({ rationale: z.string() });
const OutputFormat = zodOutputFormat(Rewrite);

const SYSTEM = `You rewrite one-sentence descriptions of festival films so they carry none of the source note's wording.

Each sentence you are given was written by quoting a film festival's programmer's
note. Your job is to say the same thing in different words, not to summarise it
more, not to soften it, not to make it blander. The sentence has a job: it appears
under a film's title and tells someone why the film was placed where it was.

Rules:
- No quotation marks of any kind, and no phrases carried over from the note. If a
  run of four or more words would appear in both, rewrite it.
- Keep every concrete claim: the register, the subject, the formal qualities, the
  comparisons to other films or directors. Those are what justify the placement.
  A sentence that survives by becoming vague has failed.
- Critics' judgements in the note are the note's opinion. You may keep the
  substance of one, but state it as description rather than as a borrowed verdict.
- Proper nouns stay: names of directors, films, places, festivals.
- One sentence, under 240 characters, no trailing full stop needed if it runs long.
- No em dashes anywhere. Use a period, a comma, or a colon instead.
- Plain words. No marketing register, no "a searing portrait of".`;

const words = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Runs of NGRAM words appearing in both the rewrite and the note. */
const liftedRuns = (rewrite, note) => {
  const a = words(rewrite);
  const b = words(note);
  const seen = new Set();
  for (let i = 0; i + NGRAM <= b.length; i++) seen.add(b.slice(i, i + NGRAM).join(" "));
  const hits = [];
  for (let i = 0; i + NGRAM <= a.length; i++) {
    const run = a.slice(i, i + NGRAM).join(" ");
    if (seen.has(run)) hits.push(run);
  }
  return hits;
};

const validate = (text, note) => {
  if (/["“”«»]/.test(text)) return "it still contains quotation marks";
  if (/—/.test(text)) return "it contains an em dash, which this project never uses";
  if (text.length > 240) return `it is ${text.length} characters, over the 240 limit`;
  const lifted = liftedRuns(text, note);
  if (lifted.length) return `this run is lifted from the note verbatim: "${lifted[0]}"`;
  return null;
};

const noteFor = (slug) => {
  const s = synopses[slug];
  return s?.synopsis ?? s?.teaser ?? "";
};

const userContent = (slug, entry, complaint) => {
  const film = bySlug.get(slug);
  const note = noteFor(slug);
  return [
    `Film: ${film?.title ?? slug}${film?.programme ? ` [${film.programme}]` : ""}`,
    "",
    "The note it was written from:",
    note || "(no note, work from the sentence alone)",
    "",
    "The sentence to rewrite:",
    entry.rationale,
    complaint ? `\nYour previous attempt was rejected because ${complaint}. Try again.` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

async function rewriteOne(slug, entry) {
  const note = noteFor(slug);
  let complaint = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      thinking: { type: "adaptive" },
      output_config: { format: OutputFormat, effort: "medium" },
      messages: [{ role: "user", content: userContent(slug, entry, complaint) }],
    });
    const text = res.content.find((b) => b.type === "text")?.text;
    const { rationale } = Lenient.parse(JSON.parse(text));
    complaint = validate(rationale, note);
    if (!complaint) return { rationale, attempts: attempt + 1 };
  }
  // Three strikes: keep the best we got and say so, rather than silently shipping
  // a sentence that failed the check the whole script exists to enforce.
  return { rationale: null, attempts: 3, failure: complaint };
}

const one = process.argv[process.argv.indexOf("--one") + 1];
if (process.argv.includes("--one")) {
  const entry = axes[one];
  if (!entry) throw new Error(`no such slug: ${one}`);
  console.log(`before: ${entry.rationale}\n`);
  const r = await rewriteOne(one, entry);
  console.log(`after:  ${r.rationale ?? `FAILED: ${r.failure}`}`);
  process.exit(0);
}

const targets = Object.entries(axes).filter(([, v]) => v.rationale && /["“”—]/.test(v.rationale));
console.log(`${targets.length} rationales need rewriting, of ${Object.keys(axes).length} total.\n`);

const failures = [];
let done = 0;
const queue = [...targets];

async function worker() {
  for (;;) {
    const next = queue.shift();
    if (!next) return;
    const [slug, entry] = next;
    try {
      const r = await rewriteOne(slug, entry);
      if (r.rationale) axes[slug] = { ...entry, rationale: r.rationale };
      else failures.push({ slug, reason: r.failure });
    } catch (err) {
      failures.push({ slug, reason: err.message });
    }
    done++;
    if (done % 20 === 0) console.log(`  ${done}/${targets.length}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\nrewrote ${done - failures.length}, failed ${failures.length}`);
for (const f of failures) console.log(`  ${f.slug}: ${f.reason}`);

if (process.argv.includes("--dry")) {
  console.log("\n--dry: nothing written.");
} else {
  fs.writeFileSync(AXES, JSON.stringify(axes, null, 2) + "\n");
  console.log(`\nwrote ${AXES}. Rebuild with: node scripts/build-lineup.mjs`);
}
