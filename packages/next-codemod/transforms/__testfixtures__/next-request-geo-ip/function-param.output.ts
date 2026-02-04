// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

import { geolocation, ipAddress } from "@vercel/functions";

function getGeo(request: NextRequest) {
  return geolocation(request);
}

function getIp(request: NextRequest) {
  return ipAddress(request);
}

export function GET(request: NextRequest) {
  const geo = getGeo(request);
  const ip = getIp(request);
  return NextResponse.json({ geo, ip });
}


