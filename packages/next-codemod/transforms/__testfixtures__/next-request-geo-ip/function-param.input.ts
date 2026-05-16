// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

function getGeo(request: NextRequest) {
  return request.geo;
}

function getIp(request: NextRequest) {
  return request.ip;
}

export function GET(request: NextRequest) {
  const geo = getGeo(request);
  const ip = getIp(request);
  return NextResponse.json({ geo, ip });
}
