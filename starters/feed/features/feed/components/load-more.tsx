"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LoadMore({ page }: { page: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          router.push(`/?page=${page}`, { scroll: false });
        });
      }}
      className="rounded-full border border-foreground/20 px-4 py-1.5 text-sm hover:bg-foreground/5 disabled:opacity-70"
    >
      {isPending ? "Loading…" : "Load more"}
    </button>
  );
}
