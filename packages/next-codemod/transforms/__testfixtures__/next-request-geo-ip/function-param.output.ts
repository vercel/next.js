// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

import { geolocation } from "@vercel/functions";

function getGeo(request: NextRequest) {
  return geolocation(request);
}

export function GET(request: NextRequest) {
  const geo = getGeo(request)
  return NextResponse.json({ geo });
}


