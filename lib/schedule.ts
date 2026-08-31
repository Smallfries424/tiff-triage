/**
 * Turning a set of chosen screenings into a day-by-day schedule, with the
 * conflicts a festival-goer actually cares about.
 *
 * Two distinct problems, and conflating them would be a mistake: a hard overlap
 * means you cannot attend both, while a tight turnaround means you can only just
 * make it and probably not across town. Both are worth showing; only one is fatal.
 */

export const DAY_ORDER = [
  "Wed Sep 09", "Thu Sep 10", "Fri Sep 11", "Sat Sep 12", "Sun Sep 13", "Mon Sep 14",
  "Tue Sep 15", "Wed Sep 16", "Thu Sep 17", "Fri Sep 18", "Sat Sep 19", "Sun Sep 20",
];

/** Minutes needed between two shows at different venues, walking downtown Toronto. */
const TRAVEL_MIN = 30;
/** Minutes needed between two shows in the same building. */
const SAME_VENUE_MIN = 15;

export interface PlanItem {
  filmId: number;
  idx: number;
  title: string;
  slug: string;
  verdict?: string;
  date: string;
  start: number;
  end: number;
  startLabel: string;
  endLabel: string;
  venue: string;
  room: string;
}

export type Issue =
  | { kind: "overlap"; withTitle: string }
  | { kind: "tight"; withTitle: string; gap: number; needed: number };

export interface ScheduledItem extends PlanItem {
  issues: Issue[];
}

export interface Day {
  date: string;
  items: ScheduledItem[];
  overlaps: number;
  tight: number;
}

export function buildSchedule(items: PlanItem[]): { days: Day[]; overlaps: number; tight: number } {
  const byDate = new Map<string, PlanItem[]>();
  for (const it of items) {
    if (!byDate.has(it.date)) byDate.set(it.date, []);
    byDate.get(it.date)!.push(it);
  }

  const days: Day[] = [];
  let overlaps = 0;
  let tight = 0;

  for (const [date, raw] of byDate) {
    const sorted = [...raw].sort((a, b) => a.start - b.start);
    const scheduled: ScheduledItem[] = sorted.map((it) => ({ ...it, issues: [] }));

    // Pairwise within a day: 6 or 7 films at most, so clarity beats cleverness.
    for (let i = 0; i < scheduled.length; i++) {
      for (let j = i + 1; j < scheduled.length; j++) {
        const a = scheduled[i];
        const b = scheduled[j];

        if (a.end > b.start) {
          a.issues.push({ kind: "overlap", withTitle: b.title });
          b.issues.push({ kind: "overlap", withTitle: a.title });
          overlaps++;
          continue;
        }

        const gap = b.start - a.end;
        const needed = a.venue === b.venue ? SAME_VENUE_MIN : TRAVEL_MIN;
        if (gap < needed) {
          a.issues.push({ kind: "tight", withTitle: b.title, gap, needed });
          b.issues.push({ kind: "tight", withTitle: a.title, gap, needed });
          tight++;
        }
      }
    }

    days.push({
      date,
      items: scheduled,
      overlaps: scheduled.filter((i) => i.issues.some((x) => x.kind === "overlap")).length,
      tight: scheduled.filter((i) => i.issues.some((x) => x.kind === "tight")).length,
    });
  }

  days.sort((a, b) => DAY_ORDER.indexOf(a.date) - DAY_ORDER.indexOf(b.date));
  return { days, overlaps, tight };
}
