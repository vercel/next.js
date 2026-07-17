import { streamCompletion } from "@/features/chat/ai";
import { conversations } from "@/features/chat/chat-data";

export async function POST(request: Request) {
  const { id, prompt } = (await request.json()) as {
    id?: string;
    prompt?: string;
  };

  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) {
    return new Response("Conversation not found", { status: 404 });
  }

  if (typeof prompt === "string" && prompt.trim()) {
    conversation.messages.push({ role: "user", content: prompt.trim() });
  }

  const lastUser = conversation.messages.findLast((m) => m.role === "user");
  if (!lastUser) {
    return new Response("Nothing to reply to", { status: 400 });
  }

  const encoder = new TextEncoder();
  let reply = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const token of streamCompletion(lastUser.content)) {
        reply += token;
        controller.enqueue(encoder.encode(token));
      }
      conversation.messages.push({ role: "assistant", content: reply });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
