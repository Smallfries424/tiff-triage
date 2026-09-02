/**
 * Whether Supabase auth is wired up.
 *
 * Lives outside client.ts so server components can read it too, because client.ts is
 * a "use client" module, and importing it from a server component would drag
 * the browser client across the boundary just to read two env vars.
 */
export const isConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
