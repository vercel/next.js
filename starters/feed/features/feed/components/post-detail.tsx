import { getPost } from "@/features/feed/feed-queries";
import { LikeButton } from "./like-button";

export async function PostDetail({ id }: { id: string }) {
  const post = await getPost(id);

  return (
    <article>
      <p className="text-sm font-medium">@{post.author}</p>
      <p className="mt-2 leading-7">{post.body}</p>
      <div className="mt-4">
        <LikeButton id={post.id} likes={post.likes} />
      </div>
    </article>
  );
}

export function PostDetailSkeleton() {
  return (
    <div aria-hidden>
      <div className="flex h-5 items-center">
        <div className="h-3.5 w-24 animate-pulse rounded bg-foreground/10" />
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <div className="h-4 w-full animate-pulse rounded bg-foreground/10" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-foreground/10" />
      </div>
      <div className="mt-4 h-6 w-12 animate-pulse rounded bg-foreground/10" />
    </div>
  );
}
