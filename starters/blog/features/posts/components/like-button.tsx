"use client";

import { useOptimistic, useTransition } from "react";
import { likePost } from "@/features/posts/posts-actions";

export function LikeButton({ slug, likes }: { slug: string; likes: number }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticLikes, addOptimisticLike] = useOptimistic(
    likes,
    (current) => current + 1,
  );

  function handleClick() {
    startTransition(async () => {
      addOptimisticLike(undefined);
      await likePost(slug);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="rounded-full border border-foreground/20 px-4 py-1.5 text-sm hover:bg-foreground/5 disabled:opacity-70"
    >
      ♥ {optimisticLikes}
    </button>
  );
}
