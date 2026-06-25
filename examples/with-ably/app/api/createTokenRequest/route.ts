import * as Ably from "ably";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  if (!process.env.ABLY_API_KEY) {
    return NextResponse.json(
      { error: "Missing ABLY_API_KEY environment variable" },
      { status: 500 },
    );
  }

  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json(
      { error: "Missing clientId query parameter" },
      { status: 400 },
    );
  }

  const client = new Ably.Rest(process.env.ABLY_API_KEY);
  const tokenRequestData = await client.auth.createTokenRequest({ clientId });
  return NextResponse.json(tokenRequestData);
}
