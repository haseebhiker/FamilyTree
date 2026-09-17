import { headers } from "next/headers";

/**
 * The browser-visible origin of the current request.
 *
 * NOT the same as `new URL(request.url).origin`, which behind a reverse proxy
 * is whatever address the server bound to: `next dev -H 0.0.0.0` reached
 * through a tunnel or a Tailscale hostname yields "http://0.0.0.0:3000", and
 * redirecting a browser there fails outright ("0.0.0.0 sent an invalid
 * response"). Vercel masks this — request.url is already the public URL
 * there — so it only shows up when testing on a real device.
 *
 * Anything building an absolute redirect URL should use this.
 */
export async function resolveOrigin(request: Request) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return new URL(request.url).origin;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
