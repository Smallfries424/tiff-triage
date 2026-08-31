"use client";

import Link from "next/link";
import { useMemo } from "react";
import probeData from "@/data/probe-films.json";
import { AXES, tasteVector, type Axis, type Reaction } from "@/lib/scoring";
import { useProbe } from "@/lib/useProbe";
import styles from "./probe.module.css";

const FILMS = probeData.films as { title: string; year: number; axes: Record<Axis, number>; probes: string }[];

const CHOICES: { value: Reaction; label: string }[] = [
  { value: "love", label: "Loved it" },
  { value: "like", label: "Liked it" },
  { value: "meh", label: "Meh" },
  { value: "dislike", label: "Not for me" },
  { value: "unseen", label: "Haven't seen it" },
];

// Plain-language readings of each pole, so the summary says something a person
// can check against themselves rather than showing them eight numbers.
const AXIS_COPY: Record<Axis, [low: string, high: string]> = {
  pace: ["you want a film to take its time", "you want a film that moves"],
  form: ["you want a story told straight", "you're up for something formally strange"],
  genre: ["you'd rather stay in the real world", "you like heightened, stylized genre"],
  weight: ["you don't need it to hurt", "you're here to be put through something"],
  comedy: ["you're not looking for jokes", "you want it funny, ideally strange-funny"],
  nonfiction: ["you'd rather watch fiction", "documentaries are your thing"],
  intl: ["you'd rather not read subtitles", "subtitles are no obstacle"],
  duration: ["keep it under two hours", "long runtimes don't scare you"],
};

export default function ProbePage() {
  const { reactions, setReaction } = useProbe();

  const { taste, answered, confidence } = useMemo(
    () => tasteVector(reactions, FILMS),
    [reactions],
  );

  const scored = Object.values(reactions).filter((r) => r !== "unseen").length;

  // Only surface axes the answers actually spoke to.
  const readings = AXES.map((axis) => ({ axis, value: taste[axis] }))
    .filter((r) => Math.abs(r.value) > 0.15)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return (
    <main className="wrap">
      <header className={styles.head}>
        <p className="eyebrow">The taste probe</p>
        <h1>Films you&rsquo;ve already seen</h1>
        <p className="lede">
          Nobody has seen this year&rsquo;s lineup yet &mdash; that&rsquo;s the point of a festival. So the
          questions are about films you <b>have</b> seen. Answer honestly rather than
          aspirationally; <b>Haven&rsquo;t seen it</b> costs nothing and is always the right answer when
          it&rsquo;s true.
        </p>
      </header>

      <div className={styles.progress} role="status">
        <div className={styles.bar}>
          <div className={styles.fill} style={{ width: `${Math.min(100, (scored / 6) * 100)}%` }} />
        </div>
        <span className={styles.count}>
          {scored === 0
            ? "Answer about six to get a useful sort"
            : scored < 6
              ? `${scored} answered — about ${6 - scored} more for a useful sort`
              : `${scored} answered — enough to sort the lineup`}
        </span>
      </div>

      <ol className={styles.list}>
        {FILMS.map((film) => {
          const current = reactions[film.title];
          return (
            <li key={film.title} className={`card ${styles.item} ${current ? styles.done : ""}`}>
              <div className={styles.filmhead}>
                <h2 className={styles.title}>
                  {film.title} <span className={styles.year}>{film.year}</span>
                </h2>
              </div>
              <div className={styles.choices} role="group" aria-label={`Your reaction to ${film.title}`}>
                {CHOICES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`${styles.choice} ${c.value === "unseen" ? styles.unseen : ""}`}
                    aria-pressed={current === c.value}
                    onClick={() => setReaction(film.title, c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <section className={`card ${styles.summary}`} aria-live="polite">
        <p className="eyebrow">What that says about you</p>
        {readings.length === 0 ? (
          <p className={styles.pending}>
            Nothing yet. Answer a few and this fills in.
          </p>
        ) : (
          <>
            <ul className={styles.readings}>
              {readings.map(({ axis, value }) => (
                <li key={axis}>
                  <span className={styles.axisName}>{axis}</span>
                  <span>{AXIS_COPY[axis][value > 0 ? 1 : 0]}</span>
                  <span className={styles.strength} aria-hidden="true">
                    {"●".repeat(Math.min(3, Math.ceil(Math.abs(value) * 3)))}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.meta}>
              {answered} answered · confidence {Math.round(confidence * 100)}%
              {confidence < 1 ? " — the bands stay wide until you answer a few more" : ""}
            </p>
            {scored >= 3 && (
              <Link href="/films" className={styles.cta}>
                See your lineup →
              </Link>
            )}
          </>
        )}
      </section>
    </main>
  );
}
