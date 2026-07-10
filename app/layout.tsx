import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HK Bus ETA | Real-time Hong Kong Bus Arrivals",
  description:
    "Free real-time ETA for KMB and Citybus routes in Hong Kong. Locate nearby stops, search routes, and save favorites. Works offline as PWA.",
  applicationName: "HK Bus ETA",
  authors: [{ name: "HK Bus ETA" }],
  keywords: ["Hong Kong", "bus", "ETA", "KMB", "Citybus", "real-time", "transit"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HK Bus ETA",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "HK Bus ETA",
    description: "Real-time Hong Kong bus arrivals for KMB & Citybus",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0ea5e9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased bg-white text-gray-900 overflow-hidden">
        {children}
      </body>
    </html>
  );
}