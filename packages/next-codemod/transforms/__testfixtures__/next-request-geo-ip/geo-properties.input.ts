// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const { city, country, region } = request.geo;
  const latitude = request.geo.latitude;
  const longitude = request.geo.longitude;
  return NextResponse.json({ city, country, region, latitude, longitude });
}
