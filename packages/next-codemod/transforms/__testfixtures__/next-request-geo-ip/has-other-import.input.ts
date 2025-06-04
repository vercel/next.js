// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

export function GET(request: NextRequest) {
  waitUntil(Promise.resolve())
  const geo = request.geo as NextRequest['geo']
  const ip = request.ip
  return NextResponse.json({ geo, ip })
}
