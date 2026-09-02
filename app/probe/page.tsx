"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import probeData from "@/data/probe-films.json";
import probeTmdb from "@/data/probe-tmdb.json";
import { AXES, tasteVector, type Axis, type Reaction, type ReactionSource } from "@/lib/scoring";
import { useProbe } from "@/lib/useProbe";
import styles from "./probe.module.css";

const FILMS = probeData.films as { title: string; year: number; axes: Record<Axis, number> }[];
const TMDB = probeTmdb as Record<string, { trailerKey?: string | null; poster?: string | null }>;

const CHOICES: { value: Reaction; label: string }[] = [
  { value: "love", label: "Loved it" },
  { value: "like", label: "Liked it" },
  { value: "meh", label: "Meh" },
  { value: "dislike", label: "Not for me" },
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
  const [openTrailer, setOpenTrailer] = useState<string | null>(null);

  const { taste, answered, seen, fromTrailer, confidence } = useMemo(
    () => tasteVector(reactions, FILMS),
    [reactions],
  );

  const readings = AXES.map((axis) => ({ axis, value: taste[axis] }))
    .filter((r) => Math.abs(r.value) > 0.15)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return (
    <main className="wrap">
      <header className={styles.head}>
        <p className="eyebrow">Fifteen questions</p>
        <h1>Films you&rsquo;ve already seen</h1>
        <p className="lede">
          Nobody has seen this year&rsquo;s lineup yet. That&rsquo;s the point of a festival. So the
          questions are about films you <b>have</b> seen. Haven&rsquo;t seen one? Watch the trailer and
          go on the vibe. That counts too, just for a bit less.
        </p>
      </header>

      <div className={styles.progress} role="status">
        <div className={styles.bar}>
          <div className={styles.fill} style={{ width: `${Math.round(confidence * 100)}%` }} />
        </div>
        <span className={styles.count}>
          {answered === 0
            ? "Answer about six to get a useful sort"
            : confidence < 1
              ? `${answered} answered, a few more for a useful sort`
              : `${answered} answered, enough to sort the lineup`}
        </span>
      </div>

      <ol className={styles.list}>
        {FILMS.map((film) => {
          const current = reactions[film.title];
          const source: ReactionSource = current?.source ?? "seen";
          const trailerKey = TMDB[film.title]?.trailerKey ?? null;
          const showTrailer = openTrailer === film.title;

          return (
            <li key={film.title} className={`card ${styles.item} ${current ? styles.done : ""}`}>
              <div className={styles.filmhead}>
                <h2 className={styles.title}>
                  {film.title} <span className={styles.year}>{film.year}</span>
                </h2>
                {current && source === "trailer" && (
                  <span className={styles.trailerBadge}>from the trailer</span>
                )}
              </div>

              <div className={styles.choices} role="group" aria-label={`Your reaction to ${film.title}`}>
                {CHOICES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={styles.choice}
                    aria-pressed={current?.reaction === c.value && source === "seen"}
                    onClick={() => setReaction(film.title, c.value, "seen")}
                  >
                    {c.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`${styles.choice} ${styles.unseen}`}
                  aria-pressed={current?.reaction === "unseen"}
                  onClick={() => {
                    setReaction(film.title, "unseen", "seen");
                    if (trailerKey) setOpenTrailer(showTrailer ? null : film.title);
                  }}
                >
                  Haven&rsquo;t seen it
                </button>
              </div>

              {/* Not seeing a film is the common case with canonical picks, so the
                  trailer is offered as a way back in rather than a dead end. */}
              {trailerKey && (current?.reaction === "unseen" || source === "trailer" || showTrailer) && (
                <div className={styles.trailerBlock}>
                  {!showTrailer ? (
                    <button
                      type="button"
                      className={styles.trailerToggle}
                      onClick={() => setOpenTrailer(film.title)}
                    >
                      ▶ Watch the trailer and judge from that
                    </button>
                  ) : (
                    <>
                      <div className={styles.trailer}>
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${trailerKey}`}
                          title={`${film.title} trailer`}
                          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          loading="lazy"
                        />
                      </div>
                      <p className={styles.trailerPrompt}>
                        Going on the trailer alone counts for about half as much as having
                        seen it.
                      </p>
                      <div className={styles.choices} role="group" aria-label={`Trailer reaction to ${film.title}`}>
                        {CHOICES.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            className={`${styles.choice} ${styles.trailerChoice}`}
                            aria-pressed={current?.reaction === c.value && source === "trailer"}
                            onClick={() => setReaction(film.title, c.value, "trailer")}
                          >
                            {c.label}
                          </button>
                        ))}
                        <button type="button" className={styles.trailerClose} onClick={() => setOpenTrailer(null)}>
                          Close
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <section className={`card ${styles.summary}`} aria-live="polite">
        <p className="eyebrow">What that says about you</p>
        {readings.length === 0 ? (
          <p className={styles.pending}>Nothing yet. Answer a few and this fills in.</p>
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
              {seen} seen{fromTrailer > 0 ? ` · ${fromTrailer} from trailers` : ""} · confidence{" "}
              {Math.round(confidence * 100)}%
              {confidence < 1 ? ". The bands stay wide until you answer a few more." : ""}
            </p>
            {answered >= 3 && (
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
