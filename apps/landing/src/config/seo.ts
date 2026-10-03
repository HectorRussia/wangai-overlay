import type { Metadata } from "next";
import { site } from "./site";

const configuredUrl = new URL(process.env.SITE_URL || site.url);
if (configuredUrl.protocol !== "https:" || configuredUrl.username || configuredUrl.password || configuredUrl.pathname !== "/" || configuredUrl.search || configuredUrl.hash) {
  throw new Error("SITE_URL must be an HTTPS origin, e.g. https://wangai.app");
}
export const siteOrigin = configuredUrl.origin;
export const indexable = process.env.NODE_ENV === "production" && process.env.SITE_INDEXABLE !== "false" && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production");

export function pageMetadata(path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: new URL(path, siteOrigin).href },
    openGraph: { title, description, url: new URL(path, siteOrigin).href, siteName: site.name, locale: "th_TH", type: "website", images: [{ url: `${siteOrigin}/opengraph-image`, width: 1200, height: 630, alt: "ว่าไง WANGAI — AI แปลเสียงพูดจากเกมและแอปอื่น" }] },
    twitter: { title, description, card: "summary_large_image", images: [`${siteOrigin}/opengraph-image`] },
  };
}
