"use client";

import Link from "next/link";
import { useMemo } from "react";
import lineupData from "@/data/lineup.json";
import probeData from "@/data/probe-films.json";
import { buildSchedule, type PlanItem } from "@/lib/schedule";
import { scoreLineup, type AxisVector } from "@/lib/scoring";
import { usePlan } from "@/lib/usePlan";
import { useProbe } from "@/lib/useProbe";
import styles from "./plan.module.css";

type Screening = { d: string; s: string; e: string; st: number; en: number; v: string; r: string; ev: number; wk: number };
type Film = { id: number; slug: string; title: string; programme: string; runtime: number | null;
  axes: AxisVector; notability: number; confidence: number; screenings: Screening[] };

const LINEUP = lineupData as unknown as Film[];
const PROBE_FILMS = probeData.films as { title: string; axes: AxisVector }[];
const BY_ID = new Map(LINEUP.map((f) => [f.id, f]));

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default function PlanPage() {
  const { keys, remove, loaded } = usePlan();
  const { reactions } = useProbe();

  const verdictById = useMemo(() => {
    if (!Object.keys(reactions).length) return new Map<number, string>();
    const { scored } = scoreLineup(
      reactions,
      PROBE_FILMS,
      LINEUP.map((f) => ({ id: f.id, title: f.title, axes: f.axes, notability: f.notability, confidence: f.confidence })),
    );
    return new Map(scored.map((s) => [s.id, s.verdict]));
  }, [reactions]);

  const { days, overlaps, tight } = useMemo(() => {
    const items: PlanItem[] = [];
    for (const k of keys) {
      const [fid, idx] = k.split(":").map(Number);
      const film = BY_ID.get(fid);
      const sc = film?.screenings[idx];
      if (!film || !sc) continue; // a stale key from an older lineup build
      items.push({
        filmId: fid, idx, title: film.title, slug: film.slug,
        verdict: verdictById.get(fid),
        date: sc.d, start: sc.st, end: sc.en,
        startLabel: sc.s, endLabel: sc.e, venue: sc.v, room: sc.r,
      });
    }
    return buildSchedule(items);
  }, [keys, verdictById]);

  const total = days.reduce((n, d) => n + d.items.length, 0);

  if (!loaded) return <main className="wrap"><p className={styles.loading}>Loading your plan&hellip;</p></main>;

  if (total === 0) {
    return (
      <main className="wrap">
        <div className={`card empty ${styles.gate}`}>
          <h1 className={styles.gateTitle}>Nothing planned yet</h1>
          <p>Pick showtimes from your lineup and they&rsquo;ll stack up here, day by day, with clashes flagged.</p>
          <Link href="/films" className={styles.cta}>Go to your lineup</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <header className={styles.head}>
        <p className="eyebrow">Your festival</p>
        <h1>The plan</h1>
        <p className="lede">
          {total} screening{total === 1 ? "" : "s"} across {days.length} day{days.length === 1 ? "" : "s"}
          {overlaps > 0 && <>, <b className={styles.bad}>{overlaps} clash{overlaps === 1 ? "" : "es"}</b> you can&rsquo;t attend both of</>}
          {tight > 0 && <>, <b className={styles.warn}>{tight} tight turnaround{tight === 1 ? "" : "s"}</b></>}
          {overlaps === 0 && tight === 0 && <>, no conflicts.</>}
        </p>
      </header>

      {days.map((day) => (
        <section key={day.date} className={styles.day}>
          <h2 className={styles.dayHead}>
            {day.date}
            <span className={styles.dayMeta}>
              {day.items.length} film{day.items.length === 1 ? "" : "s"}
            </span>
          </h2>

          {day.items.map((it) => {
            const overlap = it.issues.find((i) => i.kind === "overlap");
            const tightIssue = it.issues.find((i) => i.kind === "tight");
            const cls = overlap ? styles.clash : tightIssue ? styles.tightRow : "";
            return (
              <div key={`${it.filmId}:${it.idx}`} className={`card ${styles.item} ${cls}`}>
                <div className={styles.when}>
                  <span className={styles.time}>{it.startLabel}</span>
                  <span className={styles.till}>&ndash; {it.endLabel}</span>
                </div>
                <div className={styles.what}>
                  <Link href={`/films/${it.slug}`} className={styles.itemTitle}>{it.title}</Link>
                  <p className={styles.where}>
                    {it.room === it.venue ? it.venue : `${it.venue} · ${it.room}`}
                  </p>
                  {overlap && (
                    <p className={styles.issueBad}>
                      Overlaps {overlap.withTitle}. You can&rsquo;t make both.
                    </p>
                  )}
                  {!overlap && tightIssue && tightIssue.kind === "tight" && (
                    <p className={styles.issueWarn}>
                      Only {tightIssue.gap} min after {tightIssue.withTitle}
                      {tightIssue.needed > 15 ? ". It's a different venue." : "."}
                    </p>
                  )}
                </div>
                {it.verdict && <span className={`pill v-${it.verdict}`}>{it.verdict === "wild" ? "Wildcard" : it.verdict}</span>}
                <button className={styles.drop} onClick={() => remove(it.filmId, it.idx)}>
                  Remove
                </button>
              </div>
            );
          })}
        </section>
      ))}
    </main>
  );
}
