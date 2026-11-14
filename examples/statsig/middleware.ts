import { NextRequest, NextResponse } from "next/server";
import { STABLE_ID_COOKIE_NAME } from "./lib/statsig-helpers";

export function middleware(request: NextRequest) {
  let stableId = request.cookies.get(STABLE_ID_COOKIE_NAME)?.value;
  if (!stableId) {
    stableId = crypto.randomUUID();
    request.cookies.set(STABLE_ID_COOKIE_NAME, stableId);
  }

  const response = NextResponse.next({
    request,
  });

  response.cookies.set(STABLE_ID_COOKIE_NAME, stableId);

  return response;
}

export const config = {
  matcher: "/:path*",
};
