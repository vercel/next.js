import { NextResponse } from "next/server";

export const GET = (req) => {
  return NextResponse.json({
    pathname: req.nextUrl.pathname,
  });
};

export const runtime = "edge";
