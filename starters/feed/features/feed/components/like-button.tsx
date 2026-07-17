"use client";

import { useOptimistic, useTransition } from "react";
import { likePost } from "@/features/feed/feed-actions";

export function LikeButton({ id, likes }: { id: string; likes: number }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticLikes, addOptimisticLike] = useOptimistic(
    likes,
    (current) => current + 1,
  );

  function handleClick() {
    startTransition(async () => {
      addOptimisticLike(undefined);
      await likePost(id);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-sm text-foreground/60 transition-colors hover:text-foreground disabled:opacity-70"
    >
      ♥ {optimisticLikes}
    </button>
  );
}
