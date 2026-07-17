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

export async function appendTurn(
  id: string,
  userPrompt: string | null,
  reply: string,
) {
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) {
    return;
  }
  if (userPrompt) {
    conversation.messages.push({ role: "user", content: userPrompt });
  }
  conversation.messages.push({ role: "assistant", content: reply });
  updateTag(`conversation:${id}`);
}
