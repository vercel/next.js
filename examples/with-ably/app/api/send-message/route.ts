import * as Ably from "ably";
import { type NextRequest, NextResponse } from "next/server";
import type { ProxyMessage, TextMessage } from "../../../types";

export async function POST(request: NextRequest) {
  if (!process.env.ABLY_API_KEY) {
    return NextResponse.json(
      { error: "Missing ABLY_API_KEY environment variable" },
      { status: 500 },
    );
  }

  const body = (await request.json()) as ProxyMessage;
  const client = new Ably.Rest(process.env.ABLY_API_KEY);
  const channel = client.channels.get("some-channel-name");

  const message: TextMessage = {
    text: `Server sent a message on behalf of ${body.sender}`,
  };
  await channel.publish("test-message", message);

  return NextResponse.json({ ok: true });
}
