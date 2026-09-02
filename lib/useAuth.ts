"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient, isConfigured } from "./supabase/client";

/**
 * Session state, plus magic-link sign in.
 *
 * The app is fully usable signed out, so every consumer must tolerate
 * `session === null` as a normal state rather than an error.
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  /**
   * Send a six-digit code rather than a magic link.
   *
   * Links are single-use, and corporate mail scanners (Microsoft Safe Links and
   * friends) follow every URL they see, consuming the token before the person
   * ever clicks. A code cannot be consumed by being looked at, needs no redirect
   * allowlist, and works when the email is read on a different device from the
   * one signing in. emailRedirectTo is still sent so the link in the same email
   * keeps working for anyone who prefers it.
   */
  const signIn = async (email: string) => {
    const supabase = createClient();
    return supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/complete` },
    });
  };

  const verifyCode = async (email: string, token: string) => {
    const supabase = createClient();
    return supabase.auth.verifyOtp({ email, token: token.trim(), type: "email" });
  };

  const signOut = async () => {
    await createClient().auth.signOut();
    setSession(null);
  };

  return { session, user: session?.user ?? null, loading, signIn, verifyCode, signOut, isConfigured };
}
