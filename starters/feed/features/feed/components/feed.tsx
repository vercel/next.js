import { Suspense } from "react";
import { getFeed } from "@/features/feed/feed-queries";
import { LoadMore } from "./load-more";
import { Post, PostListSkeleton } from "./post";

async function FeedPage({ page, isLast }: { page: number; isLast: boolean }) {
  const { posts, hasMore } = await getFeed(page);
  return (
    <>
      {posts.map((post) => (
        <Post key={post.id} post={post} />
      ))}
      {isLast && hasMore ? (
        <div className="flex justify-center py-6">
          <LoadMore page={page + 1} />
        </div>
      ) : null}
    </>
  );
}

export function Feed({ page = 1 }: { page?: number }) {
  return (
    <div className="mt-8">
      {Array.from({ length: page }).map((_, i) => {
        const current = i + 1;
        const isLast = current === page;
        return current === 1 ? (
          <FeedPage key={current} page={current} isLast={isLast} />
        ) : (
          <Suspense key={current} fallback={<PostListSkeleton />}>
            <FeedPage page={current} isLast={isLast} />
          </Suspense>
        );
      })}
    </div>
  );
}
