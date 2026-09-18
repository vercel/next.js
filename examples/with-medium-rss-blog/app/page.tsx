import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">
        Medium RSS Blog Example
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        This example renders a <code>/blog</code> page from a Medium RSS feed.
        Set <code>MEDIUM_USERNAME</code> in <code>.env.local</code> to your
        Medium handle (without the <code>@</code>) and the route will fetch and
        cache your posts. Leave it empty to render an empty list.
      </p>
      <p>
        <Link
          href="/blog"
          className="text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
        >
          View the blog →
        </Link>
      </p>
    </div>
  );
}