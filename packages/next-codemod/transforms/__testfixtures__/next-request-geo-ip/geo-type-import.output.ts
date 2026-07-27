// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

import { geolocation, ipAddress, type Geo } from "@vercel/functions";

export function GET(request: NextRequest) {
  const geo = geolocation(request) as Geo
  const ip = ipAddress(request)
  return NextResponse.json({ geo, ip })
}
