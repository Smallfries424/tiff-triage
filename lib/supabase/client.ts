"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client.
 *
 * flowType is implicit rather than the PKCE default, and that is a deliberate
 * trade. PKCE stores a verifier on the device that requested the link, so a magic
 * link opened anywhere else — the usual case when someone checks email on their
 * phone — cannot complete. Implicit returns the tokens in the URL fragment, which
 * works from any device.
 *
 * The cost: tokens briefly appear in the URL. They are consumed and cleared
 * immediately by /auth/complete, and the link is single-use and short-lived. If
 * custom SMTP is later configured, the token_hash path in /auth/callback is
 * strictly better than both and this should move back to PKCE.
 *
 * Both values are public by design — the publishable key ships in the bundle.
 * Row-level security is what protects the data; see supabase/schema.sql.
 */
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit", detectSessionInUrl: true, persistSession: true } },
  );

export { isConfigured } from "./config";
