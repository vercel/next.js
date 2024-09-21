// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

import { geolocation, ipAddress, type Geo } from "@vercel/functions";

const mockGeo = {
  city: 'London',
  country: 'United Kingdom',
  latitude: 51.5074,
  longitude: -0.1278,
  region: 'England',
  timezone: 'Europe/London',
} as Geo
const mockIp = '127.0.0.1' as string | undefined

function getGeo(request: NextRequest): Geo {
  const geo = geolocation(request) ?? mockGeo;
  return geo;
}

function getIp(request: NextRequest): string | undefined {
  const ip = ipAddress(request) ?? mockIp;
  return ip;
}

export function GET(request: NextRequest) {
  const geo = getGeo(request);
  const ip = getIp(request);
  return NextResponse.json({ geo, ip });
}
