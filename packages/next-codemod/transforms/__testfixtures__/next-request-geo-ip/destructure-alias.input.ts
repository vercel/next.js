// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const { buildId, geo: geoAlias, ip: ipAlias } = request;
  return NextResponse.json({ buildId, geo: geoAlias, ip: ipAlias });
}
