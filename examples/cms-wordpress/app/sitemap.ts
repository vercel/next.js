// Package imports
import { MetadataRoute } from "next";

// Force revalidation to 0 seconds, ensuring sitemap.xml is always up to date
export const revalidate = 0;

/**
 * Fetches the total counts of various items in the sitemap from the WordPress API.
 * @returns An array of objects containing the name of each item and its total count.
 */
async function getTotalCounts() {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_WORDPRESS_API_URL}/wp-json/sitemap/v1/totalpages`,
  );
  const data = await response.json();
  if (!data) return [];
  const propertyNames = Object.keys(data);
  // If you want to remove any item from sitemap, add it to excludeItems array
  const excludeItems = ["page", "user", "category", "tag"];
  let totalArray = propertyNames
    .filter((name) => !excludeItems.includes(name))
    .map((name) => {
      return { name, total: data[name] };
    });

  return totalArray;
}

/**
 * Fetches URLs for posts from a WordPress API endpoint.
 * @param {Object} options - The options object.
 * @param {number} options.page - The page number to fetch.
 * @param {string} options.type - The type of post to fetch.
 * @param {number} options.perPage - The number of posts to fetch per page.
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of post URLs and their last modified dates.
 */
async function getPostsUrls({
  page,
  type,
  perPage,
}: {
  page: number;
  type: string;
  perPage: number;
}) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_WORDPRESS_API_URL}/wp-json/sitemap/v1/posts?pageNo=${page}&postType=${type}&perPage=${perPage}`,
  );

  const data = await response.json();

  if (!data) return [];

  const posts = data.map((post: any) => {
    return {
      url: `${process.env.NEXT_PUBLIC_BASE_URL}${post.url}`,
      lastModified: new Date(post.post_modified_date)
        .toISOString()
        .split("T")[0],
    };
  });

  return posts;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitemap = [];

  // Get the total counts of all types
  const details = await getTotalCounts();

  // Fetch postsUrls for each type, paginated, and add to sitemap
  const postsUrls = await Promise.all(
    details.map(async (detail) => {
      const { name, total } = detail;
      const perPage = 50;
      const totalPages = Math.ceil(total / perPage);

      const urls = await Promise.all(
        Array.from({ length: totalPages }, (_, i) => i + 1).map((page) =>
          getPostsUrls({ page, type: name, perPage }),
        ),
      );

      return urls.flat();
    }),
  );

  // Flatten the postsUrls array
  const posts = postsUrls.flat();

  // Add posts to sitemap
  sitemap.push(...posts);

  return sitemap;
}
