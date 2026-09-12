import Link from "next/link";
import { getMediumPosts } from "@/lib/medium";
import { formatDate } from "./utils";

// 12 hours. ISR is the actual caching layer — without it, the route would
// re-fetch the Medium feed on every visit. Adjust to taste.
export const revalidate = 43200;

export default async function BlogIndex() {
  const posts = await getMediumPosts();

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Blog</h1>
      <p className="mb-8 text-neutral-600 dark:text-neutral-400">
        Posts fetched from a Medium RSS feed.
      </p>

      {posts.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-400">
          No posts yet. Set <code>MEDIUM_USERNAME</code> in{" "}
          <code>.env.local</code> to your Medium handle.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {posts.map((post) => (
            <li key={post.slug} className="py-6">
              <Link
                href={`/blog/${post.slug}`}
                className="block hover:opacity-80"
              >
                <h2 className="text-xl font-semibold tracking-tight">
                  {post.title}
                </h2>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  {formatDate(post.date)}
                </p>
                {post.summary && (
                  <p className="mt-2 text-neutral-700 dark:text-neutral-300">
                    {post.summary}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}