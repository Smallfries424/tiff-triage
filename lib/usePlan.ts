"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "./supabase/client";
import { savePlanItem } from "./sync";
import { useAuth } from "./useAuth";

/**
 * The viewer's chosen screenings, keyed "<filmId>:<screeningIndex>".
 *
 * Same storage story as the probe: works fully signed-out, migrates on login.
 */
export const PLAN_KEY = "tiff-plan-v1";

export type PlanKey = `${number}:${number}`;
export const planKey = (filmId: number, screeningIndex: number): PlanKey =>
  `${filmId}:${screeningIndex}`;

const read = (): PlanKey[] => {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    return raw ? (JSON.parse(raw) as PlanKey[]) : [];
  } catch {
    return [];
  }
};

export function usePlan() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<PlanKey[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setKeys(read());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify(keys));
    } catch {
      /* still usable this session */
    }
  }, [keys, loaded]);

  const set = useMemo(() => new Set(keys), [keys]);

  const toggle = useCallback(
    (filmId: number, idx: number) => {
      const k = planKey(filmId, idx);
      let present = true;
      setKeys((prev) => {
        present = !prev.includes(k);
        return present ? [...prev, k] : prev.filter((x) => x !== k);
      });
      if (user) {
        void savePlanItem(createClient(), user.id, filmId, idx, present).catch(() => {});
      }
    },
    [user],
  );

  const remove = useCallback(
    (filmId: number, idx: number) => {
      const k = planKey(filmId, idx);
      setKeys((prev) => prev.filter((x) => x !== k));
      if (user) {
        void savePlanItem(createClient(), user.id, filmId, idx, false).catch(() => {});
      }
    },
    [user],
  );

  const has = useCallback((filmId: number, idx: number) => set.has(planKey(filmId, idx)), [set]);

  /** Used after a sign-in merge, when the whole set is replaced at once. */
  const replaceAll = useCallback((next: PlanKey[]) => setKeys(next), []);

  return { keys, set, toggle, remove, has, replaceAll, loaded, count: keys.length };
}
