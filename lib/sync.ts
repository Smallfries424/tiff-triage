"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Answer, Reaction, ReactionSource } from "./scoring";
import type { Reactions } from "./useProbe";
import type { PlanKey } from "./usePlan";

/**
 * Reconciling local (signed-out) state with the account on first sign-in.
 *
 * The rule that matters: signing in must never destroy work. Someone can answer
 * the probe on a laptop, sign in on a phone that already has answers, and both
 * sets have to survive. So this is a union, not a replace, and for the probe,
 * where the same film may carry different answers on each device, the local one
 * wins because it is the one they just gave.
 */

export async function pullRemote(supabase: SupabaseClient, userId: string) {
  const [{ data: probeRows, error: probeErr }, { data: planRows, error: planErr }] = await Promise.all([
    supabase.from("probe_answers").select("film_title, reaction, source").eq("user_id", userId),
    supabase.from("plan_items").select("film_id, screening_idx").eq("user_id", userId),
  ]);
  if (probeErr) throw probeErr;
  if (planErr) throw planErr;

  const reactions: Reactions = {};
  for (const r of probeRows ?? [])
    reactions[r.film_title] = {
      reaction: r.reaction as Reaction,
      source: (r.source ?? "seen") as ReactionSource,
    };
  const plan = (planRows ?? []).map((p) => `${p.film_id}:${p.screening_idx}` as PlanKey);

  return { reactions, plan };
}

export async function pushMerged(
  supabase: SupabaseClient,
  userId: string,
  localReactions: Reactions,
  localPlan: PlanKey[],
) {
  const remote = await pullRemote(supabase, userId);

  // Local wins on conflict: it is the answer the person most recently gave.
  const mergedReactions: Reactions = { ...remote.reactions, ...localReactions };
  const mergedPlan = [...new Set([...remote.plan, ...localPlan])];

  const probeRows = Object.entries(mergedReactions).map(([film_title, a]) => ({
    user_id: userId,
    film_title,
    reaction: a.reaction,
    source: a.source ?? "seen",
    updated_at: new Date().toISOString(),
  }));

  if (probeRows.length) {
    const { error } = await supabase
      .from("probe_answers")
      .upsert(probeRows, { onConflict: "user_id,film_title" });
    if (error) throw error;
  }

  const planRows = mergedPlan.map((k) => {
    const [film_id, screening_idx] = k.split(":").map(Number);
    return { user_id: userId, film_id, screening_idx };
  });

  if (planRows.length) {
    const { error } = await supabase
      .from("plan_items")
      .upsert(planRows, { onConflict: "user_id,film_id,screening_idx" });
    if (error) throw error;
  }

  return { reactions: mergedReactions, plan: mergedPlan };
}

/** Individual writes, once signed in: cheaper than re-pushing everything. */
export async function saveReaction(
  supabase: SupabaseClient, userId: string, filmTitle: string, answer: Answer | null,
) {
  if (answer === null) {
    const { error } = await supabase
      .from("probe_answers").delete().eq("user_id", userId).eq("film_title", filmTitle);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("probe_answers").upsert(
    {
      user_id: userId,
      film_title: filmTitle,
      reaction: answer.reaction,
      source: answer.source ?? "seen",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,film_title" },
  );
  if (error) throw error;
}

export async function savePlanItem(
  supabase: SupabaseClient, userId: string, filmId: number, idx: number, present: boolean,
) {
  if (!present) {
    const { error } = await supabase
      .from("plan_items").delete()
      .eq("user_id", userId).eq("film_id", filmId).eq("screening_idx", idx);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("plan_items").upsert(
    { user_id: userId, film_id: filmId, screening_idx: idx },
    { onConflict: "user_id,film_id,screening_idx" },
  );
  if (error) throw error;
}
