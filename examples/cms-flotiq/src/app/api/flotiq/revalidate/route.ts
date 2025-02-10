import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const editorkey = req.headers.get("x-editor-key") || "";

  if (editorkey !== process.env.FLOTIQ_CLIENT_AUTH_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  revalidateTag("flotiq-content");
  return new NextResponse(undefined, { status: 204 });
}
