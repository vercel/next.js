// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

function getGeo(request: NextRequest): NextRequest['geo'] {
  const geo: NextRequest['geo'] = request.geo;
  return geo;
}

function getIp(request: NextRequest): NextRequest['ip'] {
  const ip: NextRequest['ip'] = request.ip;
  return ip;
}

export function GET(request: NextRequest) {
  const geo = getGeo(request);
  const ip = getIp(request);
  return NextResponse.json({ geo, ip });
}
