"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { appendTurn } from "@/features/chat/chat-actions";
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
    async (prompt: string, persistUser: boolean) => {
      setIsStreaming(true);
      setMessages((current) => [
        ...current,
        ...(persistUser ? [{ role: "user" as const, content: prompt }] : []),
        { role: "assistant" as const, content: "" },
      ]);

      let reply = "";
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
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
          reply += decoder.decode(value, { stream: true });
          const content = reply;
          setMessages((current) => {
            const next = [...current];
            next[next.length - 1] = { role: "assistant", content };
            return next;
          });
        }
        await appendTurn(id, persistUser ? prompt : null, reply);
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
      void streamReply(last.content, false);
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
      <Composer
        disabled={isStreaming}
        onSend={(text) => streamReply(text, true)}
      />
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="h-8 w-40 self-end rounded-2xl bg-foreground/10" />
      <div className="flex max-w-prose flex-col gap-2">
        <div className="h-4 w-full animate-pulse rounded bg-foreground/10" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-foreground/10" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-foreground/10" />
      </div>
    </div>
  );
}
