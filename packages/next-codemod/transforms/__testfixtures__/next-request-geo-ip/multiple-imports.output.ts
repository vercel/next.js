// @ts-nocheck
import Link from "next/link";
// should added right below the "next/server" import
import { type NextRequest, NextResponse } from "next/server";
import { geolocation, ipAddress } from "@vercel/functions";
import Script from "next/script";
import { notFound } from "next/navigation";

export function GET(request: NextRequest) {
  const geo = geolocation(request)
  const ip = ipAddress(request)
  return NextResponse.json({ geo, ip })
}
