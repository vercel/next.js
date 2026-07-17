"use client";

import { useActionState, useRef } from "react";
import { createPost, type PostState } from "@/features/feed/feed-actions";

export function Composer() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<PostState, FormData>(
    createPost,
    null,
  );

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      <textarea
        name="body"
        rows={2}
        disabled={pending}
        placeholder="What's happening?"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        className="resize-none rounded-lg border border-foreground/20 bg-background px-3 py-2 text-sm disabled:opacity-70"
      />
      {state?.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}
      <button
        disabled={pending}
        className="self-end rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-70"
      >
        {pending ? "Posting…" : "Post"}
      </button>
    </form>
  );
}
