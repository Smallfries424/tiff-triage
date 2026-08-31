import Link from "next/link";

export default async function AuthFailed({ searchParams }: PageProps<"/auth/failed">) {
  const { reason } = await searchParams;
  const text = typeof reason === "string" ? reason : "Something went wrong.";
  const sameBrowser = text.toLowerCase().includes("verifier");

  return (
    <main className="wrap" style={{ padding: "70px 20px", maxWidth: 640 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Sign-in failed</h1>
      <p style={{ color: "var(--ink-2)" }}>
        {sameBrowser
          ? "That link was opened on a different device from the one that requested it."
          : text}
      </p>
      {sameBrowser && (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          Ask for a new link and open it on this device, or have the site switched to
          device-independent links.
        </p>
      )}
      <p><Link href="/account">Request another link</Link></p>
    </main>
  );
}
