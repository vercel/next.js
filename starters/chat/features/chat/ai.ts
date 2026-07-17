import "server-only";

const CANNED_REPLY =
  "This response streams token by token from app/api/chat/route.ts. " +
  "The chat UI reads the stream and renders each chunk as it arrives. " +
  "Swap features/chat/ai.ts for a real model to make it think.";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function* streamCompletion(prompt: string) {
  const tokens = `You said "${prompt}". ${CANNED_REPLY}`.split(" ");

  for (const token of tokens) {
    await delay(40);
    yield `${token} `;
  }
}
