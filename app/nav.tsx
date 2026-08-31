"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import styles from "./nav.module.css";

const LINKS = [
  { href: "/probe", label: "Probe" },
  { href: "/films", label: "Lineup" },
  { href: "/plan", label: "Plan" },
];

export default function Nav() {
  const path = usePathname();
  const { user, isConfigured } = useAuth();
  return (
    <nav className={styles.nav} aria-label="Main">
      <div className={`wrap ${styles.inner}`}>
        <Link href="/" className={styles.brand}>
          Festival&nbsp;Triage
        </Link>
        <ul className={styles.links}>
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className={styles.link}
                aria-current={path === l.href || path.startsWith(l.href + "/") ? "page" : undefined}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        {isConfigured && (
          <Link
            href="/account"
            className={styles.account}
            aria-current={path === "/account" ? "page" : undefined}
          >
            {user ? (user.email?.split("@")[0] ?? "Account") : "Sign in"}
          </Link>
        )}
      </div>
    </nav>
  );
}
