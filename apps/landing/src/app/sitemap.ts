import type { MetadataRoute } from "next";
import { siteOrigin } from "@/config/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/privacy", "/terms"].map((path) => ({ url: new URL(path, siteOrigin).href }));
}
