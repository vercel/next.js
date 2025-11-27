import { NextRequest, NextResponse, userAgent } from "next/server";

export const config = {
  matcher: ["/", "/((?!api|static|_next).*)"],
};

export async function proxy(req: NextRequest) {
  const url = req.nextUrl.clone();

  const { device } = userAgent(req);

  url.pathname = `/${device?.type || "desktop"}${req.nextUrl.pathname}`;

  return NextResponse.rewrite(url);
}
