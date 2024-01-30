import "server-only";
import { MetadataRoute } from "next";

export default function sitemapIndex(): MetadataRoute.SitemapIndex {
  return [
    {
      url: "https://example.com/sitemap.xml",
      lastModified: "2021-01-01",
    },
    {
      url: "https://example.com/sitemap2.xml",
      lastModified: "2021-01-01",
    },
  ];
}
