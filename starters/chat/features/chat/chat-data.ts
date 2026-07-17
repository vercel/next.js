import "server-only";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
};

const globalForChat = globalThis as unknown as {
  conversations?: Conversation[];
};

export const conversations: Conversation[] = (globalForChat.conversations ??= [
  {
    id: "getting-started",
    title: "Getting started",
    messages: [
      { role: "user", content: "What is this starter?" },
      {
        role: "assistant",
        content:
          "A hybrid chat app on Cache Components: the shell and sidebar prerender, and replies stream from a Route Handler. Swap features/chat/ai.ts for a real model.",
      },
    ],
  },
]);
