"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { conversations } from "./chat-data";

export async function createConversation(prompt: string) {
  const text = prompt.trim();
  if (!text) {
    return;
  }

  const id = crypto.randomUUID();
  conversations.unshift({
    id,
    title: text.slice(0, 40),
    messages: [{ role: "user", content: text }],
  });
  updateTag("conversations");
  redirect(`/chat/${id}`);
}
