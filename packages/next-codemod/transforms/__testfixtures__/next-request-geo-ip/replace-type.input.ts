// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

const mockGeo = {
  city: 'London',
  country: 'United Kingdom',
  latitude: 51.5074,
  longitude: -0.1278,
  region: 'England',
  timezone: 'Europe/London',
} as NextRequest['geo']
const mockIp = '127.0.0.1' as NextRequest['ip']

function getGeo(request: NextRequest): NextRequest['geo'] {
  const geo = request.geo ?? mockGeo;
  return geo;
}

function getIp(request: NextRequest): NextRequest['ip'] {
  const ip = request.ip ?? mockIp;
  return ip;
}

export function GET(request: NextRequest) {
  const geo = getGeo(request);
  const ip = getIp(request);
  return NextResponse.json({ geo, ip });
}
