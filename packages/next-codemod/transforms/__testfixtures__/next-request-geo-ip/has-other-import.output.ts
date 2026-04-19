// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";
import { waitUntil, geolocation, ipAddress, type Geo } from "@vercel/functions";

export function GET(request: NextRequest) {
  waitUntil(Promise.resolve())
  const geo = geolocation(request) as Geo
  const ip = ipAddress(request)
  return NextResponse.json({ geo, ip })
}
