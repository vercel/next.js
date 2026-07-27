// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";
import { geolocation as geo, ipAddress as ip, Geo as GeoType } from "@vercel/functions";

export function GET(request: NextRequest) {
  const geo = request.geo as GeoType
  const ip = request.ip
  return NextResponse.json({ geo, ip })
}
