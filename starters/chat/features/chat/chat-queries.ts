import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { conversations } from "./chat-data";

export async function getConversations() {
  "use cache";
  cacheLife("hours");
  cacheTag("conversations");

  return conversations.map(({ id, title }) => ({ id, title }));
}

export async function getConversation(id: string) {
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) {
    notFound();
  }
  return conversation;
}
