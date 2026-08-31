"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Where an implicit-flow magic link lands.
 *
 * The tokens arrive in the URL fragment, which never reaches the server — so
 * unlike /auth/callback this has to be a client page. It consumes them, clears
 * them out of the address bar, and moves on.
 */
export default function AuthComplete() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const url = new URL(window.location.href);
    const frag = new URLSearchParams(url.hash.replace(/^#/, ""));

    (async () => {
      const urlErr = frag.get("error_description") ?? url.searchParams.get("error_description");
      if (urlErr) return setError(decodeURIComponent(urlErr.replace(/\+/g, " ")));

      const access_token = frag.get("access_token");
      const refresh_token = frag.get("refresh_token");

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) return setError(error.message);
        // Don't leave credentials sitting in the address bar or in history.
        window.history.replaceState({}, "", "/auth/complete");
        return router.replace("/account");
      }

      // detectSessionInUrl may have consumed the fragment before this ran.
      const { data } = await supabase.auth.getSession();
      if (data.session) return router.replace("/account");

      setError("That link didn't carry any sign-in details. It may already have been used.");
    })();
  }, [router]);

  return (
    <main className="wrap" style={{ padding: "70px 20px", maxWidth: 640 }}>
      {error ? (
        <>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>Sign-in failed</h1>
          <p style={{ color: "var(--ink-2)" }}>{error}</p>
          <p><Link href="/account">Request another link</Link></p>
        </>
      ) : (
        <p style={{ color: "var(--muted)" }}>Signing you in&hellip;</p>
      )}
    </main>
  );
}
