import { draftMode } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  draftMode().disable();

  const response = NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL}${path}`,
  );
  response.headers.set(
    "Set-Cookie",
    `wp_jwt=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;`,
  );

  return response;
}
