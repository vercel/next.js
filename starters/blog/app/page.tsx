import { Suspense } from "react";
import {
  PostList,
  PostListSkeleton,
} from "@/features/posts/components/post-list";

export default function HomePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Latest posts</h1>
      <Suspense fallback={<PostListSkeleton />}>
        <PostList />
      </Suspense>
    </>
  );
}
