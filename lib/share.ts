"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read-only plan sharing.
 *
 * A share link is a bearer token: anyone holding the URL can see the schedule.
 * That is the intent — you send it to whoever you're going with — but it means
 * revoking has to be real, so revoke deletes the row rather than hiding it, and
 * regenerating issues a genuinely new token rather than reusing the old one.
 */

export async function getShareToken(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("plan_shares")
    .select("token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.token ?? null;
}

export async function createShareToken(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("plan_shares")
    .insert({ user_id: userId })
    .select("token")
    .single();
  if (error) throw error;
  return data.token;
}

/** Revoke by deleting: an old link must stop working, not merely be hidden. */
export async function revokeShareToken(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from("plan_shares").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function regenerateShareToken(supabase: SupabaseClient, userId: string): Promise<string> {
  await revokeShareToken(supabase, userId);
  return createShareToken(supabase, userId);
}

/** The only way an anonymous visitor reaches a plan. */
export async function fetchSharedPlan(
  supabase: SupabaseClient,
  token: string,
): Promise<{ film_id: number; screening_idx: number }[]> {
  const { data, error } = await supabase.rpc("shared_plan", { share_token: token });
  if (error) throw error;
  return data ?? [];
}
