import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { site } from "@/config/site";
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
  title: site.title,
  description: site.description,
  openGraph: {
    title: site.title,
    description: site.description,
    type: "website",
    locale: "th_TH",
    siteName: site.name,
  },
  twitter: {
    card: "summary",
    title: site.title,
    description: site.description,
  },
};

export const viewport: Viewport = { themeColor: "#090d0d" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
