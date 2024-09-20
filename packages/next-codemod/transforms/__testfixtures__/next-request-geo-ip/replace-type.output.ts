// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

import type { Geo } from "@vercel/functions";
import { geolocation, ipAddress } from "@vercel/functions";

function getGeo(request: NextRequest): Geo {
  const geo: Geo = geolocation(request);
  return geo;
}

function getIp(request: NextRequest): string | undefined {
  const ip: string | undefined = ipAddress(request);
  return ip;
}

export function GET(request: NextRequest) {
  const geo = getGeo(request);
  const ip = getIp(request);
  return NextResponse.json({ geo, ip });
}
