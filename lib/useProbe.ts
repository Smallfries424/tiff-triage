"use client";

import { useCallback, useEffect, useState } from "react";
import type { Answer, Reaction, ReactionSource } from "./scoring";
import { createClient } from "./supabase/client";
import { saveReaction } from "./sync";
import { useAuth } from "./useAuth";

/**
 * Probe answers live in localStorage until the viewer signs in.
 *
 * That is a deliberate product choice, not a shortcut: anyone can take the probe
 * and see their sorted lineup without an account, and the answers migrate up on
 * first login. Requiring a signup to try a festival tool loses most of the people
 * you would actually send it to.
 */
export const PROBE_KEY = "tiff-probe-v1";

export type Reactions = Record<string, Answer>;

/** Older saves stored a bare string; normalise so nobody's probe is lost. */
const normalise = (raw: unknown): Reactions => {
  const out: Reactions = {};
  for (const [title, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
    if (typeof v === "string") out[title] = { reaction: v as Reaction, source: "seen" };
    else if (v && typeof v === "object" && "reaction" in v) out[title] = v as Answer;
  }
  return out;
};

const read = (): Reactions => {
  try {
    const raw = localStorage.getItem(PROBE_KEY);
    return raw ? normalise(JSON.parse(raw)) : {};
  } catch {
    // private window or blocked storage — an empty probe is a valid state
    return {};
  }
};

export function useProbe() {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Reactions>({});
  // Server render has no localStorage, so the first paint must match the server's
  // empty state and fill in afterwards rather than hydrating mismatched.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setReactions(read());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(PROBE_KEY, JSON.stringify(reactions));
    } catch {
      // still usable for this session
    }
  }, [reactions, loaded]);

  const setReaction = useCallback(
    (title: string, value: Reaction | null, source: ReactionSource = "seen") => {
      let next: Answer | null = value === null ? null : { reaction: value, source };
      setReactions((prev) => {
        const current = prev[title];
        const same = current && current.reaction === value && (current.source ?? "seen") === source;
        if (value === null || same) {
          next = null;
          const { [title]: _drop, ...rest } = prev;
          return rest;
        }
        return { ...prev, [title]: { reaction: value, source } };
      });

      // Local state is the source of truth for the UI; the write-through is
      // best-effort so a flaky connection never blocks answering a question.
      if (user) {
        void saveReaction(createClient(), user.id, title, next).catch(() => {});
      }
    },
    [user],
  );

  const clear = useCallback(() => setReactions({}), []);

  /** Used after a sign-in merge, when the whole set is replaced at once. */
  const replaceAll = useCallback((next: Reactions) => setReactions(next), []);

  return { reactions, setReaction, clear, replaceAll, loaded };
}
