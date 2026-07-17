import Link from "next/link";
import { Suspense } from "react";
import {
  PostDetail,
  PostDetailSkeleton,
} from "@/features/feed/components/post-detail";

export const prefetch = "allow-runtime";

export default function PostPage({ params }: PageProps<"/post/[id]">) {
  return (
    <>
      <Link
        href="/"
        className="text-sm text-foreground/60 hover:text-foreground"
      >
        ← Back
      </Link>
      <div className="mt-4">
        <Suspense fallback={<PostDetailSkeleton />}>
          {params.then(({ id }) => (
            <PostDetail id={id} />
          ))}
        </Suspense>
      </div>
    </>
  );
}
