import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { site } from "@/config/site";
import { indexable, pageMetadata, siteOrigin } from "@/config/seo";
import "@/styles/globals.css";

const bodyFont = localFont({
  src: "../../public/fonts/NotoSansThai.woff2",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
});
const displayFont = localFont({
  src: "../../public/fonts/Kanit-Bold.woff2",
  variable: "--font-display",
  weight: "700",
  display: "swap",
});

export const metadata: Metadata = {
  ...pageMetadata("/", site.title, site.description),
  metadataBase: new URL(siteOrigin),
  applicationName: site.name,
  category: "technology",
  robots: indexable ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } } : { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#090d0d" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <head><link rel="describedby" href="/llms.txt" type="text/plain" /></head>
      <body>{children}</body>
    </html>
  );
}
