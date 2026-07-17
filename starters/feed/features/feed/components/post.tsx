import Link from "next/link";
import type { Post as PostType } from "@/features/feed/feed-data";
import { LikeButton } from "./like-button";

export function Post({ post }: { post: PostType }) {
  return (
    <article className="border-b border-foreground/10 py-4">
      <p className="text-sm font-medium">@{post.author}</p>
      <p className="mt-1 leading-6">{post.body}</p>
      <div className="mt-2 flex items-center gap-4">
        <LikeButton id={post.id} likes={post.likes} />
        <Link
          href={`/post/${post.id}`}
          prefetch
          className="text-sm text-foreground/50 hover:text-foreground"
        >
          View
        </Link>
      </div>
    </article>
  );
}

export function PostListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border-b border-foreground/10 py-4">
          <div className="flex h-5 items-center">
            <div className="h-3.5 w-20 animate-pulse rounded bg-foreground/10" />
          </div>
          <div className="mt-1 flex h-6 items-center">
            <div className="h-4 w-full max-w-sm animate-pulse rounded bg-foreground/10" />
          </div>
          <div className="mt-2 flex h-5 items-center">
            <div className="h-3.5 w-10 animate-pulse rounded bg-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
