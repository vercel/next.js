import Parser from "rss-parser";
import mediumFeed from "./medium-feed.json";

// Undefined is treated the same as empty string — see the !MY_USERNAME
// guard below. Trim in case the env var was pasted with surrounding
// whitespace; without this we'd silently build a malformed feed URL.
const MY_USERNAME = process.env.MEDIUM_USERNAME?.trim();

export type MediumPost = Partial<{
  title: string;
  link: string;
  content: string; // full HTML content
  date: string;
  slug: string;
  summary: string;
  image: string;
}>;

type MediumFeedItem = {
  title?: string;
  link?: string;
  content?: string;
  "content:encoded"?: string;
  isoDate?: string;
};

// Fetches the user's Medium RSS feed and normalizes each entry. On any
// error (network, missing username, malformed XML) falls back to the
// committed snapshot so the page never crashes.
export async function getMediumPosts(): Promise<MediumPost[]> {
  if (!MY_USERNAME) {
    return parseMediumFeed(
      mediumFeed as unknown as Parser.Output<MediumFeedItem>,
    );
  }

  const parser = new Parser();
  try {
    const feed = await parser.parseURL(
      `https://medium.com/feed/@${MY_USERNAME}`,
    );
    return parseMediumFeed(feed);
  } catch (error) {
    console.error("Error fetching Medium posts:", error);
    return parseMediumFeed(
      mediumFeed as unknown as Parser.Output<MediumFeedItem>,
    );
  }
}

export function parseMediumFeed(
  feed: Parser.Output<MediumFeedItem>,
): MediumPost[] {
  return feed.items.map((item) => {
    const content = item["content:encoded"] || item.content || ""; // full HTML
    const summary =
      content.replace(/<[^>]+>/g, " ").slice(0, 160) + "..."; // plain text summary
    const image = content.match(/<img[^>]+src="([^">]+)"/)?.[1];
    return {
      title: item.title,
      link: item.link,
      content,
      summary,
      image,
      date: item.isoDate,
      // Medium uses GUID slugs — last path segment of the canonical URL.
      slug: item.link?.split("?")[0]?.split("/").pop(),
    };
  });
}

export async function getMediumPost(slug: string) {
  const posts = await getMediumPosts();
  return posts.find((p) => p.slug === slug);
}