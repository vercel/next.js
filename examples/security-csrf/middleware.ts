import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  let response = NextResponse.next();
  let cookie = request.cookies.get("csrf");

  if (cookie === undefined) {
    let value = uuidv4();
    response.cookies.set("csrf", value);

    return response;
  }

  return;
}
