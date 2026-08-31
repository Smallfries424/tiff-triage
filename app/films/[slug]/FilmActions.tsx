"use client";

import Link from "next/link";
import { useMemo } from "react";
import lineupData from "@/data/lineup.json";
import probeData from "@/data/probe-films.json";
import { scoreLineup, type Axis, type AxisVector } from "@/lib/scoring";
import { usePlan } from "@/lib/usePlan";
import { useProbe } from "@/lib/useProbe";
import styles from "./film.module.css";

type Screening = { d: string; s: string; e: string; st: number; en: number; v: string; r: string; ev: number; wk: number };
type Film = { id: number; slug: string; title: string; axes: AxisVector; notability: number;
  confidence: number; screenings: Screening[] };

const LINEUP = lineupData as unknown as Film[];
const PROBE_FILMS = probeData.films as { title: string; axes: AxisVector }[];

const DRIVER_COPY: Record<Axis, [neg: string, pos: string]> = {
  pace: ["takes its time", "keeps moving"],
  form: ["told straight", "formally bold"],
  genre: ["naturalistic", "heightened genre"],
  weight: ["easy going", "heavy"],
  comedy: ["not a comedy", "funny"],
  nonfiction: ["fiction", "documentary"],
  intl: ["in English", "subtitled"],
  duration: ["short", "a long sit"],
};

export default function FilmActions({ filmId }: { filmId: number }) {
  const { reactions } = useProbe();
  const { toggle, has, loaded } = usePlan();

  const me = LINEUP.find((f) => f.id === filmId);

  const mine = useMemo(() => {
    if (!Object.keys(reactions).length) return null;
    const { scored } = scoreLineup(
      reactions,
      PROBE_FILMS,
      LINEUP.map((f) => ({ id: f.id, title: f.title, axes: f.axes, notability: f.notability, confidence: f.confidence })),
    );
    return scored.find((s) => s.id === filmId) ?? null;
  }, [reactions, filmId]);

  if (!me) return null;

  return (
    <>
      <section className={`card ${styles.fitBox} ${mine ? `v-${mine.verdict}` : ""}`}>
        {mine ? (
          <>
            <div className={styles.fitRow}>
              <span className={`pill ${styles.fitPill}`}>{mine.verdict === "wild" ? "Wildcard" : mine.verdict}</span>
              <span className={styles.fitNum}>{mine.fit}</span>
              <span className={styles.fitLabel}>fit for you</span>
            </div>
            {mine.drivers.length > 0 && (
              <div className={styles.drivers}>
                {mine.drivers.map((d) => (
                  <span key={d.axis} className={d.contribution > 0 ? styles.driverPos : styles.driverNeg}>
                    {DRIVER_COPY[d.axis][me.axes[d.axis] > 0 ? 1 : 0]}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className={styles.noProbe}>
            <Link href="/probe">Take the probe</Link> to see how this one fits you.
          </p>
        )}
      </section>

      <section className={styles.showtimes}>
        <h2 className={styles.h2}>All screenings</h2>
        {me.screenings.length === 0 && <p className={styles.none}>No public screenings.</p>}
        <div className={styles.slots}>
          {me.screenings.map((sc, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.slot} ${sc.ev && sc.wk ? styles.prime : ""}`}
              aria-pressed={loaded && has(me.id, i)}
              onClick={() => toggle(me.id, i)}
            >
              <span className={styles.slotDay}>{sc.d}</span>
              <span className={styles.slotTime}>{sc.s} &ndash; {sc.e}</span>
              <span className={styles.slotVenue}>{sc.r === sc.v ? sc.v : `${sc.v} · ${sc.r}`}</span>
              <span className={styles.slotAdd}>{loaded && has(me.id, i) ? "In plan" : "Add"}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
