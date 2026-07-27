// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

import { geolocation, ipAddress } from "@vercel/functions";

export function GET(request: NextRequest) {
  const geo = geolocation(request)
  const ip = ipAddress(request)
  return NextResponse.json({ geo, ip })
}
