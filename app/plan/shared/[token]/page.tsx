"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import lineupData from "@/data/lineup.json";
import { buildSchedule, type PlanItem } from "@/lib/schedule";
import { createClient, isConfigured } from "@/lib/supabase/client";
import { fetchSharedPlan } from "@/lib/share";
import type { AxisVector } from "@/lib/scoring";
import styles from "../../plan.module.css";

type Screening = { d: string; s: string; e: string; st: number; en: number; v: string; r: string; ev: number; wk: number };
type Film = { id: number; slug: string; title: string; programme: string; axes: AxisVector; screenings: Screening[] };

const LINEUP = lineupData as unknown as Film[];
const BY_ID = new Map(LINEUP.map((f) => [f.id, f]));

export default function SharedPlanPage({ params }: PageProps<"/plan/shared/[token]">) {
  const { token } = use(params);
  const [rows, setRows] = useState<{ film_id: number; screening_idx: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) {
      setError("Sharing isn't configured on this deployment.");
      return;
    }
    fetchSharedPlan(createClient(), token)
      .then(setRows)
      .catch((e) => setError((e as Error).message));
  }, [token]);

  const { days, overlaps } = useMemo(() => {
    const items: PlanItem[] = [];
    for (const r of rows ?? []) {
      const film = BY_ID.get(r.film_id);
      const sc = film?.screenings[r.screening_idx];
      if (!film || !sc) continue;
      items.push({
        filmId: r.film_id, idx: r.screening_idx, title: film.title, slug: film.slug,
        date: sc.d, start: sc.st, end: sc.en,
        startLabel: sc.s, endLabel: sc.e, venue: sc.v, room: sc.r,
      });
    }
    return buildSchedule(items);
  }, [rows]);

  const total = days.reduce((n, d) => n + d.items.length, 0);

  if (error) {
    return (
      <main className="wrap">
        <div className={`card empty ${styles.gate}`}>
          <h1 className={styles.gateTitle}>Can&rsquo;t open this plan</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (rows === null) {
    return <main className="wrap"><p className={styles.loading}>Loading the plan&hellip;</p></main>;
  }

  // An empty result is indistinguishable from a revoked or mistyped link, and
  // saying so is more honest than showing a blank schedule.
  if (total === 0) {
    return (
      <main className="wrap">
        <div className={`card empty ${styles.gate}`}>
          <h1 className={styles.gateTitle}>Nothing here</h1>
          <p>
            This link has either been revoked, or the plan is empty. Ask for a fresh one.
          </p>
          <Link href="/films" className={styles.cta}>Build your own lineup</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <header className={styles.head}>
        <p className="eyebrow">A shared plan · read only</p>
        <h1>Their festival</h1>
        <p className="lede">
          {total} screening{total === 1 ? "" : "s"} across {days.length} day{days.length === 1 ? "" : "s"}
          {overlaps > 0 && <>, including {overlaps} clash{overlaps === 1 ? "" : "es"}</>}.{" "}
          <Link href="/probe">Build your own</Link> to see how these fit your taste.
        </p>
      </header>

      {days.map((day) => (
        <section key={day.date} className={styles.day}>
          <h2 className={styles.dayHead}>
            {day.date}
            <span className={styles.dayMeta}>{day.items.length} film{day.items.length === 1 ? "" : "s"}</span>
          </h2>
          {day.items.map((it) => {
            const overlap = it.issues.find((i) => i.kind === "overlap");
            return (
              <div key={`${it.filmId}:${it.idx}`} className={`card ${styles.item} ${overlap ? styles.clash : ""}`}>
                <div className={styles.when}>
                  <span className={styles.time}>{it.startLabel}</span>
                  <span className={styles.till}>&ndash; {it.endLabel}</span>
                </div>
                <div className={styles.what}>
                  <Link href={`/films/${it.slug}`} className={styles.itemTitle}>{it.title}</Link>
                  <p className={styles.where}>{it.room === it.venue ? it.venue : `${it.venue} · ${it.room}`}</p>
                  {overlap && <p className={styles.issueBad}>Overlaps {overlap.withTitle}.</p>}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </main>
  );
}
