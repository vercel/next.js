// @ts-nocheck
/* eslint-disable */
import { type NextRequest, NextResponse } from "next/server";

import { geolocation } from "@vercel/functions";

export function GET(request: NextRequest) {
  const { city, country, region, latitude, longitude } = geolocation(request);
  return NextResponse.json({ city, country, region, latitude, longitude });
}
