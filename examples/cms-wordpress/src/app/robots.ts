// Package imports
import { MetadataRoute } from "next";

// Force revalidation to 0 seconds, ensuring robots.txt is always up to date
export const revalidate = 0;

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Fetch robots.txt from NEXT_PUBLIC_WORDPRESS_API_URL
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_WORDPRESS_API_URL}/robots.txt`,
    { cache: "no-store" },
  );

  // Get the text from the response
  const text = await res.text();

  // Split the text into lines
  const lines = text.split("\n");

  const userAgent = lines
    .find((line) => line.startsWith("User-agent: "))
    ?.replace("User-agent: ", "");
  const allow = lines
    .find((line) => line.startsWith("Allow: "))
    ?.replace("Allow: ", "");
  const disallow = lines
    .find((line) => line.startsWith("Disallow: "))
    ?.replace("Disallow: ", "");
  const sitemap = lines
    .find((line) => line.startsWith("Sitemap: "))
    ?.replace("Sitemap: ", "");

  const robots: MetadataRoute.Robots = {
    rules: {
      userAgent,
      allow,
      disallow,
    },
    sitemap,
  };

  // Return the robots object
  return robots;
}
