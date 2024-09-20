// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";
import type { Geo } from "@vercel/functions";
import { waitUntil, geolocation, ipAddress } from "@vercel/functions";

export function GET(request: NextRequest) {
  waitUntil(Promise.resolve())
  const geo = geolocation(request) as Geo
  const ip = ipAddress(request)
  return NextResponse.json({ geo, ip })
}
