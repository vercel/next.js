// @ts-nocheck
import Link from "next/link";
// should added RIGHT BELOW the FIRST "next/server" import
import type { NextRequest } from "next/server";
import { geolocation, ipAddress } from "@vercel/functions";
import Script from "next/script";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const geo = geolocation(request)
  const ip = ipAddress(request)
  return NextResponse.json({ geo, ip })
}
