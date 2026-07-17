import { Suspense } from "react";
import { Composer } from "@/features/feed/components/composer";
import { Feed } from "@/features/feed/components/feed";
import { PostListSkeleton } from "@/features/feed/components/post";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <Composer />
      <Suspense fallback={<PostListSkeleton />}>
        {searchParams.then(({ page }) => (
          <Feed page={Number(page) || 1} />
        ))}
      </Suspense>
    </>
  );
}
