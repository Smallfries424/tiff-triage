"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import lineupData from "@/data/lineup.json";
import probeData from "@/data/probe-films.json";
import { usePlan } from "@/lib/usePlan";
import { useProbe } from "@/lib/useProbe";
import { scoreLineup, type AxisVector, type Axis, type Verdict } from "@/lib/scoring";
import { DAY_ORDER } from "@/lib/schedule";
import styles from "./films.module.css";

type Screening = { d: string; s: string; e: string; st: number; en: number; v: string; r: string; ev: number; wk: number };
type Film = {
  id: number; slug: string; title: string; programme: string; directors: string | null;
  countries: string[]; languages: string[]; premium: number; runtime: number | null;
  axes: AxisVector; notability: number; confidence: number; why: string | null; noNote: number;
  poster: string | null; trailer: string | null; screenings: Screening[];
  nEvening: number; nWeekend: number; nPrime: number; firstDate: string | null;
};

const LINEUP = lineupData as unknown as Film[];
const PROBE_FILMS = probeData.films as { title: string; axes: AxisVector }[];
const PROGRAMMES = [...new Set(LINEUP.map((f) => f.programme))].sort();

const VERDICTS: { key: Verdict; label: string }[] = [
  { key: "yes", label: "Yes" },
  { key: "maybe", label: "Maybe" },
  { key: "wild", label: "Wildcard" },
  { key: "no", label: "No" },
];

// Plain-language phrasing for the driver chips, so a card says why in words.
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

// Only the days the lineup actually screens on, in festival order, so the date
// filter can never offer a day that would empty the page.
const DAYS = DAY_ORDER.filter((d) => LINEUP.some((f) => f.screenings.some((sc) => sc.d === d)));

export default function FilmsPage() {
  const { reactions, loaded } = useProbe();
  const { toggle, has, count } = usePlan();
  const [active, setActive] = useState<Set<Verdict>>(new Set<Verdict>(["yes"]));
  const [evening, setEvening] = useState(false);
  const [weekend, setWeekend] = useState(false);
  const [day, setDay] = useState("");
  const [programme, setProgramme] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"fit" | "title" | "date">("fit");

  const { scored, answered, confidence } = useMemo(() => {
    const lineup = LINEUP.map((f) => ({
      id: f.id, title: f.title, axes: f.axes,
      notability: f.notability, confidence: f.confidence,
    }));
    return scoreLineup(reactions, PROBE_FILMS, lineup);
  }, [reactions]);

  const byId = useMemo(() => new Map(scored.map((s) => [s.id, s])), [scored]);
  const tally = useMemo(() => {
    const t: Record<string, number> = { yes: 0, maybe: 0, wild: 0, no: 0 };
    for (const s of scored) t[s.verdict]++;
    return t;
  }, [scored]);

  // Date, evening and weekend all describe a single screening, so they are asked of
  // one screening at a time. Testing them independently would let a film through on
  // a Friday evening show and a Sunday matinee when "Fri Sep 11" and "Evening" are
  // both on, and neither of its screenings is what was asked for.
  const slotFilter = day !== "" || evening || weekend;
  const matchesSlot = useCallback(
    (sc: Screening) => (!day || sc.d === day) && (!evening || sc.ev === 1) && (!weekend || sc.wk === 1),
    [day, evening, weekend],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = LINEUP.filter((f) => {
      const s = byId.get(f.id);
      if (!s || !active.has(s.verdict)) return false;
      if (slotFilter && !f.screenings.some(matchesSlot)) return false;
      if (programme && f.programme !== programme) return false;
      if (q) {
        const hay = `${f.title} ${f.directors ?? ""} ${f.countries.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Sorting by date means the earliest screening you could actually attend, which
    // is the earliest one still passing the filters, not the film's first ever show.
    const earliest = (f: Film) => {
      let best = Infinity;
      for (const sc of f.screenings) {
        if (slotFilter && !matchesSlot(sc)) continue;
        const at = DAY_ORDER.indexOf(sc.d) * 1440 + sc.st;
        if (at < best) best = at;
      }
      return best;
    };
    rows.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "date") return earliest(a) - earliest(b);
      return (byId.get(b.id)?.fit ?? 0) - (byId.get(a.id)?.fit ?? 0);
    });
    return rows;
  }, [byId, active, slotFilter, matchesSlot, programme, query, sort]);

  const toggleVerdict = (v: Verdict) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next.size ? next : new Set<Verdict>([v]);
    });

  if (!loaded) return <main className="wrap"><p className={styles.loading}>Loading your lineup&hellip;</p></main>;

  if (answered === 0) {
    return (
      <main className="wrap">
        <div className={`card empty ${styles.gate}`}>
          <h1 className={styles.gateTitle}>Take the probe first</h1>
          <p>
            The lineup can&rsquo;t be sorted until it knows what you like. Fifteen questions about
            films you&rsquo;ve already seen.
          </p>
          <Link href="/probe" className={styles.cta}>Start the probe</Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className={`wrap ${styles.head}`}>
        <p className="eyebrow">TIFF 2026 &middot; Sep 10&ndash;20 &middot; {LINEUP.length} films</p>
        <h1>Your lineup</h1>
        <p className="lede">
          Sorted against {answered} answer{answered === 1 ? "" : "s"}.{" "}
          {confidence < 1 && (
            <>
              Still a bit uncertain &mdash; <Link href="/probe">answer a few more</Link> to sharpen it.
            </>
          )}
        </p>
        <div className={styles.tally}>
          {VERDICTS.map((v) => (
            <div key={v.key} className={`v-${v.key} ${styles.tallyCell}`}>
              <div className={styles.tallyN}>{tally[v.key]}</div>
              <div className={styles.tallyK}>{v.label}</div>
            </div>
          ))}
        </div>
      </header>

      <div className={styles.bar}>
        <div className={`wrap ${styles.barIn}`}>
          <div className={styles.chips}>
            {VERDICTS.map((v) => (
              <button key={v.key} className={`chip v-${v.key}`} aria-pressed={active.has(v.key)}
                onClick={() => toggleVerdict(v.key)}>
                {v.label} <span className="ct">{tally[v.key]}</span>
              </button>
            ))}
          </div>
          <button className="toggle" aria-pressed={evening} onClick={() => setEvening((v) => !v)}>Evening 17:30+</button>
          <button className="toggle" aria-pressed={weekend} onClick={() => setWeekend((v) => !v)}>Weekend</button>
          <span className={styles.spacer} />
          <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Filter by date">
            <option value="">All dates</option>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={programme} onChange={(e) => setProgramme(e.target.value)} aria-label="Filter by programme">
            <option value="">All programmes</option>
            {PROGRAMMES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort order">
            <option value="fit">Sort: best fit</option>
            <option value="title">Sort: title</option>
            <option value="date">Sort: earliest screening</option>
          </select>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, director, country&hellip;" aria-label="Search" />
        </div>
      </div>

      <div className="wrap">
        <p className={styles.count}>
          {visible.length} film{visible.length === 1 ? "" : "s"}
          {count > 0 && (
            <>
              {" · "}
              <Link href="/plan" className={styles.planLink}>
                {count} in your plan
              </Link>
            </>
          )}
        </p>
        <div className={styles.list}>
          {visible.map((f) => {
            const s = byId.get(f.id)!;
            // Only five showtimes fit on a card, so when a filter is on, the ones it
            // matched lead — otherwise a film listed under "Fri Sep 11" can show five
            // dates that aren't Friday. The original index rides along because that is
            // what the plan stores; reordering without it would move the wrong slot.
            const slots = f.screenings.map((sc, i) => ({ sc, i }));
            if (slotFilter) {
              slots.sort((a, b) => Number(matchesSlot(b.sc)) - Number(matchesSlot(a.sc)));
            }
            return (
              <article key={f.id} className={`card v-${s.verdict} ${styles.card}`}>
                <div className={styles.main}>
                  <div className={styles.titlerow}>
                    <h2 className={styles.title}>
                      <Link href={`/films/${f.slug}`}>{f.title}</Link>
                    </h2>
                    <span className={`pill ${styles.pill}`}>{s.verdict === "wild" ? "Wildcard" : s.verdict}</span>
                    <span className={styles.fit} title="Fit score">{s.fit}</span>
                  </div>

                  <p className="meta">
                    <span className={styles.prog}>{f.programme}</span>
                    {f.directors && <span>{f.directors}</span>}
                    {f.runtime && <span>{f.runtime} min</span>}
                    {f.countries.length > 0 && <span>{f.countries.join(", ")}</span>}
                  </p>

                  {f.noNote ? (
                    <p className={styles.nonote}>
                      A shorts programme &mdash; TIFF publishes no note for these, so this placement is a guess.
                    </p>
                  ) : (
                    f.why && <p className={styles.why}>{f.why}</p>
                  )}

                  {s.drivers.length > 0 && (
                    <div className={styles.drivers}>
                      {s.drivers.map((d) => (
                        <span key={d.axis} className={d.contribution > 0 ? styles.driverPos : styles.driverNeg}>
                          {DRIVER_COPY[d.axis][f.axes[d.axis] > 0 ? 1 : 0]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className={styles.times}>
                  <h3>Showtimes</h3>
                  {f.screenings.length === 0 && <p className={styles.none}>No public screenings</p>}
                  {slots.slice(0, 5).map(({ sc, i }) => (
                    <button
                      key={i}
                      type="button"
                      className={`${styles.slot} ${sc.ev && sc.wk ? styles.prime : ""}`}
                      aria-pressed={has(f.id, i)}
                      onClick={() => toggle(f.id, i)}
                      title={has(f.id, i) ? "Remove from plan" : "Add to plan"}
                    >
                      <span className={styles.d}>{sc.d.replace("Sep ", "")}</span>
                      <span className={styles.t}>{sc.s}</span>
                      <span className={styles.rm}>{sc.v}</span>
                    </button>
                  ))}
                  {slots.length > 5 && (
                    <p className={styles.more}>+{slots.length - 5} more</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
