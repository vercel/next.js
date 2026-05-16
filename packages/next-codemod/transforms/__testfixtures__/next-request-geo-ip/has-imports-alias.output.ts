// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";
import { geolocation as geo, ipAddress as ip, Geo as GeoType } from "@vercel/functions";

export function GET(request: NextRequest) {
  const geo = geo(request) as GeoType
  const ip = ip(request)
  return NextResponse.json({ geo, ip })
}
