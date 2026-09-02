import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Completes an email sign-in, server-side.
 *
 * Two shapes arrive here, and both are supported deliberately:
 *
 *   ?token_hash=…&type=magiclink — verifyOtp. Works from ANY device, because
 *     nothing device-local is needed. This is what makes a link forwarded to a
 *     friend's phone actually work, and it is the preferred path.
 *
 *   ?code=…                      — PKCE exchange. Only succeeds in the browser
 *     that requested the link, since the verifier cookie lives there.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();

  // Only a path on this site. Resolving against url.origin is not enough on its
  // own: new URL("//evil.com", origin) is evil.com, and so is a leading "/\",
  // which some parsers fold to "//". A sign-in redirect is worth the paranoia —
  // it is exactly the hop a phishing link wants, since the victim has just been
  // told to expect a redirect after logging in.
  const requested = url.searchParams.get("next");
  const next = requested && /^\/[^/\\]/.test(requested) ? requested : "/films";

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/auth/failed?reason=${encodeURIComponent(reason)}`, url.origin));

  const providerError = url.searchParams.get("error_description");
  if (providerError) return fail(providerError);

  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) return fail(error.message);
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.message);
    return NextResponse.redirect(new URL(next, url.origin));
  }

  return fail("The link didn't carry any sign-in details.");
}
