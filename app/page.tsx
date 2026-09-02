import Link from "next/link";
import { isConfigured } from "@/lib/supabase/config";
import styles from "./home.module.css";

export default function Home() {
  return (
    <main className="wrap" style={{ paddingTop: 48 }}>
      <p className="eyebrow">TIFF 2026 · Sep 10–20</p>
      <h1>Festival Triage</h1>
      <p className="lede">
        Two hundred and forty-four films you have never seen. Answer fifteen questions about films
        you <b>have</b> seen, and the lineup sorts itself.
      </p>

      <div className={styles.actions}>
        <Link href="/probe" className={styles.primary}>
          Start the probe
        </Link>
        {isConfigured && (
          <Link href="/account" className={styles.secondary}>
            Already answered? Sign in
          </Link>
        )}
      </div>

      <p className={styles.reassure}>
        Fifteen films, about three minutes. No account and no email &mdash; your answers stay in
        this browser. Sign in later if you want them on your phone too.
      </p>
    </main>
  );
}
