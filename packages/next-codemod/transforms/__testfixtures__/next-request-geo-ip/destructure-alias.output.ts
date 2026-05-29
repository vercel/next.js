// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

import { geolocation, ipAddress } from "@vercel/functions";

export function GET(request: NextRequest) {
  const {
    buildId
  } = request;
  const ipAlias = ipAddress(request);
  const geoAlias = geolocation(request);
  return NextResponse.json({ buildId, geo: geoAlias, ip: ipAlias });
}
