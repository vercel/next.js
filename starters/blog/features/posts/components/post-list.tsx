import Link from "next/link";
import { getPosts } from "@/features/posts/posts-queries";

export async function PostList() {
  const posts = await getPosts();

  return (
    <ul className="mt-8 flex flex-col gap-8">
      {posts.map((post) => (
        <li key={post.slug}>
          <article>
            <h2 className="font-medium">
              <Link href={`/blog/${post.slug}`} className="hover:underline">
                {post.title}
              </Link>
            </h2>
            <p className="mt-1 text-sm text-foreground/70">{post.excerpt}</p>
            <p className="mt-2 text-xs text-foreground/50">
              {post.publishedAt} · {post.likes} likes
            </p>
          </article>
        </li>
      ))}
    </ul>
  );
}

export function PostListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="mt-8 flex flex-col gap-8">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <div className="flex h-6 items-center">
            <div className="h-4 w-48 animate-pulse rounded bg-foreground/10" />
          </div>
          <div className="mt-1 flex h-5 items-center">
            <div className="h-3.5 w-full max-w-md animate-pulse rounded bg-foreground/10" />
          </div>
          <div className="mt-2 flex h-4 items-center">
            <div className="h-3 w-32 animate-pulse rounded bg-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
