// @ts-nocheck
import Link from "next/link";
// should added RIGHT BELOW the FIRST "next/server" import
import type { NextRequest } from "next/server";
import Script from "next/script";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const geo = request.geo
  const ip = request.ip
  return NextResponse.json({ geo, ip })
}
