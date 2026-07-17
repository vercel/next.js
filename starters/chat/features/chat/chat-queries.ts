import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { conversations } from "./chat-data";

function delay() {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

export async function getConversations() {
  "use cache";
  cacheLife("hours");
  cacheTag("conversations");

  return conversations.map(({ id, title }) => ({ id, title }));
}

export async function getConversation(id: string) {
  await delay();
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) {
    notFound();
  }
  return conversation;
}
