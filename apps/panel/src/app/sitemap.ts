import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/landing/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl()}/`, changeFrequency: "weekly", priority: 1 }];
}
