import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Anemon",
  description: "PMamba training monitor",
  applicationName: "Anemon",
  icons: {
    icon: [
      { url: "/anemon-icon.png", type: "image/png", sizes: "512x512" },
      { url: "/anemon-icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [
      { url: "/anemon-icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/anemon-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Anemon",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function AnemonLayout({ children }: { children: React.ReactNode }) {
  return children;
}
