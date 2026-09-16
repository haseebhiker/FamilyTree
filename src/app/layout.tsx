import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BfcacheReload } from "@/components/bfcache-reload";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "Nambavargal Family Tree";
const DESCRIPTION = "Private family tree for the Nambavargal family.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    title: "Family Tree",
    statusBarStyle: "default",
    capable: true,
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  // Explicit og:image, not just relying on a crawler's own fallback to
  // apple-touch-icon or a favicon — that's what produced the working
  // preview in the first place, and it's exactly the kind of unofficial
  // behavior that can silently stop working (as it just did) without any
  // change on this end at all.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://familytree.haseeb.in",
    siteName: TITLE,
    images: [{ url: "/icon-512.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/icon-512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BfcacheReload />
        {children}
      </body>
    </html>
  );
}
