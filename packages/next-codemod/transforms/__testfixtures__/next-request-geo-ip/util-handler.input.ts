// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

function getGeo(request: NextRequest) {
  return request.geo
}

export function GET(request: NextRequest) {
  const geo = getGeo(request)
  return NextResponse.json({ geo });
}
