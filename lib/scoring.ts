/**
 * Turning fifteen reactions into a sorted festival.
 *
 * The v1 app hardcoded a verdict per film from one offline pass, which cannot
 * work once every user has their own taste. Here a user's probe reactions become
 * a vector over the eight axes in data/probe-films.json, each lineup film carries
 * a vector on the same axes, and fit is the agreement between the two.
 */

export const AXES = [
  "pace",
  "form",
  "genre",
  "weight",
  "comedy",
  "nonfiction",
  "intl",
  "duration",
] as const;

export type Axis = (typeof AXES)[number];
export type AxisVector = Record<Axis, number>;

export type Reaction = "love" | "like" | "meh" | "dislike" | "unseen";

/**
 * "meh" is deliberately 0 rather than slightly negative: it means the film did
 * not move them, which is evidence of nothing about the axes it loads on.
 * "unseen" is dropped entirely rather than scored, so skipping stays free.
 */
const WEIGHT: Record<Reaction, number> = {
  love: 2,
  like: 1,
  meh: 0,
  dislike: -1,
  unseen: 0,
};

const SCORED: Reaction[] = ["love", "like", "meh", "dislike"];

export interface ProbeFilm {
  title: string;
  axes: AxisVector;
}

const zero = (): AxisVector => Object.fromEntries(AXES.map((a) => [a, 0])) as AxisVector;

/**
 * Build the taste vector.
 *
 * Each axis is a weighted average rather than a sum, so someone who answers five
 * questions and someone who answers fifteen land on the same scale — only their
 * confidence differs. Dividing by the summed magnitude of the weights (not the
 * count) keeps a single passionate "love" from outweighing several mild "like"s
 * more than it should.
 */
export function tasteVector(
  reactions: Record<string, Reaction>,
  probeFilms: ProbeFilm[],
): { taste: AxisVector; answered: number; confidence: number } {
  const taste = zero();
  const mass = zero();
  let answered = 0;

  for (const film of probeFilms) {
    const reaction = reactions[film.title];
    if (!reaction || !SCORED.includes(reaction)) continue;
    answered++;

    const w = WEIGHT[reaction];
    for (const axis of AXES) {
      const loading = film.axes[axis] ?? 0;
      taste[axis] += w * loading;
      // A "meh" still tells us the axis was probed, so magnitude accumulates
      // even at weight 0 — otherwise indifference would read as a strong signal.
      mass[axis] += Math.abs(loading) * Math.max(Math.abs(w), 0.5);
    }
  }

  for (const axis of AXES) {
    taste[axis] = mass[axis] > 0 ? taste[axis] / mass[axis] : 0;
  }

  // Six of fifteen is enough to sort a lineup usefully; below that the bands
  // widen rather than the app pretending to be sure.
  const confidence = Math.min(1, answered / 6);

  return { taste, answered, confidence };
}

export interface LineupFilm {
  id: number;
  title: string;
  axes: AxisVector;
  /** 0-1. Festival signal independent of taste: premiere status, programme weight. */
  notability?: number;
  /**
   * 0-1. How well the source material supported placing this film at all. Films
   * with no published note (TIFF's shorts packages) come back around 0.15, and
   * must not be sorted as confidently as one read from a full programmer's note.
   */
  confidence?: number;
}

export type Verdict = "yes" | "maybe" | "wild" | "no";

export interface Scored {
  id: number;
  title: string;
  fit: number; // 0-100
  verdict: Verdict;
  /** The axes that drove this result, strongest first — the "why" shown on the card. */
  drivers: { axis: Axis; contribution: number }[];
}

/**
 * Fit is a dot product between taste and the film, scaled by how much of the
 * film's character the probe actually spoke to. A film loading hard on axes the
 * user never answered about scores near neutral rather than confidently wrong.
 */
export function scoreFilm(taste: AxisVector, film: LineupFilm, userConfidence: number): Omit<Scored, "verdict"> {
  let dot = 0;
  let magnitude = 0;
  const drivers: { axis: Axis; contribution: number }[] = [];

  for (const axis of AXES) {
    const f = film.axes[axis] ?? 0;
    const t = taste[axis] ?? 0;
    const contribution = t * f;
    dot += contribution;
    magnitude += Math.abs(f);
    if (Math.abs(contribution) > 0.05) drivers.push({ axis, contribution });
  }

  const raw = magnitude > 0 ? dot / magnitude : 0; // roughly -1..1

  // Two independent kinds of doubt, and both pull toward neutral: how much the
  // user has told us, and how much the source told us about the film.
  const certainty = userConfidence * (film.confidence ?? 1);
  const fit = Math.round(50 + 50 * raw * certainty);

  drivers.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return { id: film.id, title: film.title, fit: Math.max(0, Math.min(100, fit)), drivers: drivers.slice(0, 3) };
}

/**
 * Verdict bands, set relative to this viewer's own distribution.
 *
 * Absolute cutoffs do not work here. Six of the eight axes run 0..1 rather than
 * -1..+1, so a film can only score negatively on an axis the viewer actively
 * dislikes — fits bunch between roughly 45 and 90 and almost never reach a fixed
 * "no" threshold. Ranking against the lineup instead guarantees a usable triage
 * for every viewer, which is the whole job.
 *
 * Wildcard earns its keep here: a film this viewer's taste rejects, that is
 * notable enough to gamble on anyway. Without it the app only ever confirms what
 * someone already likes, which is the opposite of what a festival is for.
 */
export interface Bands {
  yes: number;
  no: number;
}

/** Share of the lineup in each bucket. Yes stays small enough to be a shortlist. */
const YES_SHARE = 0.22;
const NO_SHARE = 0.3;

export function computeBands(fits: number[]): Bands {
  const sorted = [...fits].sort((a, b) => b - a);
  const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 50;
  return { yes: at(YES_SHARE), no: at(1 - NO_SHARE) };
}

export function verdictFor(fit: number, bands: Bands, notability = 0): Verdict {
  if (fit >= bands.yes) return "yes";
  if (fit <= bands.no) return notability >= 0.7 ? "wild" : "no";
  return "maybe";
}

export function scoreLineup(
  reactions: Record<string, Reaction>,
  probeFilms: ProbeFilm[],
  lineup: LineupFilm[],
): { scored: Scored[]; answered: number; confidence: number; bands: Bands } {
  const { taste, answered, confidence } = tasteVector(reactions, probeFilms);

  const raw = lineup.map((film) => scoreFilm(taste, film, confidence));
  const bands = computeBands(raw.map((s) => s.fit));
  const notabilityBySlug = new Map(lineup.map((f) => [f.id, f.notability ?? 0]));

  const scored = raw
    .map((s) => ({ ...s, verdict: verdictFor(s.fit, bands, notabilityBySlug.get(s.id) ?? 0) }))
    .sort((a, b) => b.fit - a.fit);

  return { scored, answered, confidence, bands };
}
