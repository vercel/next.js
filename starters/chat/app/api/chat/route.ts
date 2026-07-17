import { streamCompletion } from "@/features/chat/ai";

export async function POST(request: Request) {
  const { prompt } = (await request.json()) as { prompt?: string };
  if (typeof prompt !== "string" || !prompt.trim()) {
    return new Response("Nothing to reply to", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const token of streamCompletion(prompt)) {
        controller.enqueue(encoder.encode(token));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
