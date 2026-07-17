import { getPost } from "@/features/posts/posts-queries";
import { LikeButton } from "./like-button";

export async function PostDetail({ slug }: { slug: string }) {
  const post = await getPost(slug);

  return (
    <article>
      <h1 className="text-2xl font-semibold">{post.title}</h1>
      <p className="mt-2 text-xs text-foreground/50">{post.publishedAt}</p>
      <p className="mt-8 leading-7">{post.content}</p>
      <div className="mt-8">
        <LikeButton slug={post.slug} likes={post.likes} />
      </div>
    </article>
  );
}

export function PostDetailSkeleton() {
  return (
    <div aria-hidden>
      <div className="flex h-8 items-center">
        <div className="h-6 w-64 animate-pulse rounded bg-foreground/10" />
      </div>
      <div className="mt-2 flex h-4 items-center">
        <div className="h-3 w-20 animate-pulse rounded bg-foreground/10" />
      </div>
      <div className="mt-8">
        {[undefined, undefined, "w-3/5"].map((width, i) => (
          <div key={i} className="flex h-7 items-center">
            <div
              className={`h-4 ${width ?? "w-full"} animate-pulse rounded bg-foreground/10`}
            />
          </div>
        ))}
      </div>
      <div className="mt-8 h-8.5 w-16 animate-pulse rounded-full bg-foreground/10" />
    </div>
  );
}
