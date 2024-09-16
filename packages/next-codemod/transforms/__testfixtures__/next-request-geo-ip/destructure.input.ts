// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const { buildId, geo, ip } = request;
  return NextResponse.json({ buildId, geo, ip });
}
