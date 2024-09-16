// @ts-nocheck
/* eslint-disable */
import { type NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const { city, country, region, latitude, longitude } = request.geo;
  return NextResponse.json({ city, country, region, latitude, longitude });
}
