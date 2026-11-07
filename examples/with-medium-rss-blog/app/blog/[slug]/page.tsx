import { notFound } from "next/navigation";
import { getMediumPost, getMediumPosts } from "@/lib/medium";
import { sanitizeMediumHtml } from "@/lib/sanitize";
import { formatDate } from "../utils";

// Match the index route's revalidate window so a single deploy refreshes
// both the list and individual posts in lockstep.
export const revalidate = 43200;

export async function generateStaticParams() {
  const posts = await getMediumPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getMediumPost(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getMediumPost(slug);

  if (!post) notFound();

  return (
    <article>
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">{post.title}</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          {formatDate(post.date)}
        </p>
      </header>

      {/* dangerouslySetInnerHTML is safe here: the HTML is sanitized through
          DOMPurify with an explicit tag + attribute allowlist before render. */}
      <div
        className="prose max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{
          __html: sanitizeMediumHtml(post.content ?? ""),
        }}
      />
    </article>
  );
}