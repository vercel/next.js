"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@/features/chat/chat-data";
import { Composer } from "./composer";

export function Conversation({
  id,
  initialMessages,
}: {
  id: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const startedRef = useRef(false);

  const streamReply = useCallback(
    async (prompt?: string) => {
      setIsStreaming(true);
      setMessages((current) => [
        ...current,
        ...(prompt ? [{ role: "user" as const, content: prompt }] : []),
        { role: "assistant", content: "" },
      ]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, prompt }),
        });
        if (!response.ok || !response.body) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          setMessages((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            next[next.length - 1] = {
              role: "assistant",
              content: last.content + chunk,
            };
            return next;
          });
        }
      } catch {
        setMessages((current) => {
          const next = [...current];
          next[next.length - 1] = {
            role: "assistant",
            content: "Something went wrong. Try again.",
          };
          return next;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const last = initialMessages[initialMessages.length - 1];
    if (!startedRef.current && last?.role === "user") {
      startedRef.current = true;
      void streamReply();
    }
  }, [initialMessages, streamReply]);

  return (
    <div className="flex flex-1 flex-col">
      <ul className="flex flex-1 flex-col gap-4">
        {messages.map((message, i) => (
          <li
            key={i}
            className={
              message.role === "user"
                ? "self-end rounded-2xl bg-foreground/10 px-4 py-2"
                : "max-w-prose leading-7"
            }
          >
            {message.content || <span aria-hidden>…</span>}
          </li>
        ))}
      </ul>
      <Composer disabled={isStreaming} onSend={(text) => streamReply(text)} />
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div aria-hidden className="flex flex-1 flex-col gap-4">
      <div className="h-9 w-40 self-end rounded-2xl bg-foreground/10" />
      <div className="h-16 w-full max-w-prose animate-pulse rounded bg-foreground/10" />
    </div>
  );
}
