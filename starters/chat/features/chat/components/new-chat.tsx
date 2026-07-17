"use client";

import { useTransition } from "react";
import { createConversation } from "@/features/chat/chat-actions";
import { Composer } from "./composer";

const SUGGESTED = [
  "Explain Cache Components in one sentence.",
  "Draft a short product announcement.",
  "Give me three ideas for a blog post.",
];

export function NewChat() {
  const [isPending, startTransition] = useTransition();

  function send(text: string) {
    startTransition(() => createConversation(text));
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">What can I help with?</h1>
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTED.map((prompt) => (
            <button
              key={prompt}
              onClick={() => send(prompt)}
              disabled={isPending}
              className="rounded-full border border-foreground/20 px-3 py-1.5 text-sm hover:bg-foreground/5 disabled:opacity-70"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
      <Composer disabled={isPending} onSend={send} />
    </div>
  );
}
