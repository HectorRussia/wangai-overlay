import type { MetadataRoute } from "next";
import { indexable, siteOrigin } from "@/config/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: indexable ? { userAgent: ["*", "OAI-SearchBot"], allow: "/" } : { userAgent: "*", disallow: "/" },
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
