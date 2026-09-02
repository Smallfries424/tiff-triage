"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { usePlan } from "@/lib/usePlan";
import { useProbe } from "@/lib/useProbe";
import { pushMerged } from "@/lib/sync";
import { createShareToken, getShareToken, regenerateShareToken, revokeShareToken } from "@/lib/share";
import styles from "./account.module.css";

export default function AccountPage() {
  const { user, loading, signIn, verifyCode, signOut, isConfigured } = useAuth();
  const { reactions, replaceAll: replaceProbe } = useProbe();
  const { keys, replaceAll: replacePlan } = usePlan();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // On first sign-in, fold whatever is on this device into the account rather
  // than letting either side clobber the other.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const merged = await pushMerged(createClient(), user.id, reactions, keys);
        if (cancelled) return;
        replaceProbe(merged.reactions);
        replacePlan(merged.plan);
        setSyncNote(
          `Synced — ${Object.keys(merged.reactions).length} probe answers, ${merged.plan.length} planned screenings.`,
        );
      } catch (e) {
        if (!cancelled) setSyncNote(`Sync failed: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs on sign-in only; local edits sync individually after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Load any existing share link once signed in.
  useEffect(() => {
    if (!user) return;
    getShareToken(createClient(), user.id)
      .then(setShareToken)
      .catch(() => {});
  }, [user]);

  const shareUrl = shareToken
    ? `${typeof window === "undefined" ? "" : window.location.origin}/plan/shared/${shareToken}`
    : null;

  const withShare = async (fn: () => Promise<string | null>) => {
    setShareBusy(true);
    try {
      setShareToken(await fn());
      setCopied(false);
    } catch {
      /* leave the previous state; the button can simply be pressed again */
    } finally {
      setShareBusy(false);
    }
  };

  if (!isConfigured) {
    return (
      <main className="wrap">
        <div className={`card empty ${styles.box}`}>
          <p>Accounts aren&rsquo;t configured on this deployment. Everything still works locally.</p>
        </div>
      </main>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signIn(email.trim());
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await verifyCode(email.trim(), code);
    setBusy(false);
    if (error) setError(error.message);
    // On success useAuth's listener flips `user`, and the page re-renders itself.
  };

  return (
    <main className="wrap">
      <header className={styles.head}>
        <p className="eyebrow">Account</p>
        <h1>{user ? "You're signed in" : "Sync across devices"}</h1>
      </header>

      <div className={`card ${styles.box}`}>
        {loading ? (
          <p className={styles.muted}>Checking&hellip;</p>
        ) : user ? (
          <>
            <p className={styles.who}>{user.email}</p>
            {syncNote && <p className={styles.muted}>{syncNote}</p>}
            <button className="toggle" onClick={() => void signOut()}>Sign out</button>
            <p className={styles.fine}>
              Signing out leaves your answers on this device — it doesn&rsquo;t erase them.
            </p>

            <div className={styles.share}>
              <p className="eyebrow">Share your plan</p>
              {shareUrl ? (
                <>
                  <div className={styles.shareRow}>
                    <input className={styles.shareInput} readOnly value={shareUrl}
                      onFocus={(e) => e.currentTarget.select()} aria-label="Your share link" />
                    <button className="toggle" onClick={() => {
                      void navigator.clipboard?.writeText(shareUrl).then(() => setCopied(true)).catch(() => {});
                    }}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className={styles.fine}>
                    Anyone with this link can see your schedule &mdash; the films and times, nothing
                    else. They can&rsquo;t change it, and it doesn&rsquo;t show your name or your taste.
                  </p>
                  <div className={styles.shareRow}>
                    <button className="toggle" disabled={shareBusy}
                      onClick={() => void withShare(() => regenerateShareToken(createClient(), user.id))}>
                      New link
                    </button>
                    <button className="toggle" disabled={shareBusy}
                      onClick={() => void withShare(async () => {
                        await revokeShareToken(createClient(), user.id);
                        return null;
                      })}>
                      Revoke
                    </button>
                  </div>
                  <p className={styles.fine}>
                    &ldquo;New link&rdquo; stops the old one working.
                  </p>
                </>
              ) : (
                <>
                  <p className={styles.muted}>
                    Make a read-only link to send to whoever you&rsquo;re going with.
                  </p>
                  <button className="toggle" disabled={shareBusy}
                    onClick={() => void withShare(() => createShareToken(createClient(), user.id))}>
                    {shareBusy ? "Creating…" : "Create share link"}
                  </button>
                </>
              )}
            </div>
          </>
        ) : sent ? (
          <>
            <p><b>Check your email.</b></p>
            <p className={styles.muted}>
              We sent a code to {email}. Type it in below &mdash; that works even if your mail
              provider mangles links.
            </p>
            <p className={styles.muted}>
              <b>Not there? Check your junk or spam folder.</b> A first email from an address you
              have never written to often lands there, and marking it &ldquo;not spam&rdquo; means
              the next one won&rsquo;t.
            </p>
            <form onSubmit={submitCode} className={styles.form}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Code from the email"
                aria-label="Code from the email"
                className={`${styles.input} ${styles.codeInput}`}
              />
              <button className="toggle" disabled={busy || code.length < 6}>
                {busy ? "Checking…" : "Sign in"}
              </button>
            </form>
            {error && <p className={styles.error}>{error}</p>}
            <p className={styles.fine}>
              The same email also contains a link, if you'd rather click that. Codes are more
              reliable &mdash; some corporate mail scanners follow links and use them up before you
              get there.
            </p>
            <button className={styles.linkish} onClick={() => { setSent(false); setCode(""); setError(null); }}>
              Use a different email
            </button>
          </>
        ) : (
          <>
            <p className={styles.muted}>
              You don&rsquo;t need an account to use this. Sign in only if you want your probe and
              plan on more than one device — handy when you&rsquo;re at the festival with your phone.
            </p>
            <p className={styles.fine}>
              We&rsquo;ll email you a six-digit code. If it doesn&rsquo;t arrive within a minute,
              check your junk folder.
            </p>
            <form onSubmit={submit} className={styles.form}>
              <input
                type="email" required value={email} placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)} aria-label="Email address"
                className={styles.input}
              />
              <button className="toggle" disabled={busy || !email.trim()}>
                {busy ? "Sending…" : "Email me a code"}
              </button>
            </form>
            {error && <p className={styles.error}>{error}</p>}
          </>
        )}
      </div>
    </main>
  );
}
