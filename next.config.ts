import type { NextConfig } from "next";

// Hosts allowed to load Next's dev resources (HMR etc). Without this, opening
// `next dev` from anything but localhost — a phone on the LAN, a tunnel, a
// Tailscale hostname — is blocked, and the page renders but never hydrates.
// Set DEV_ORIGINS in .env.local, comma-separated. No effect on production.
const devOrigins = process.env.DEV_ORIGINS?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  ...(devOrigins?.length ? { allowedDevOrigins: devOrigins } : {}),
};

export default nextConfig;
