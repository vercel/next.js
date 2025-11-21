// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

import { geolocation } from "@vercel/functions";

export function GET(request: NextRequest) {
  const { city, country, region } = geolocation(request);
  const latitude = geolocation(request).latitude;
  const longitude = geolocation(request).longitude;
  return NextResponse.json({ city, country, region, latitude, longitude });
}
