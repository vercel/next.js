// @ts-nocheck
import Link from "next/link";
// should added right below the "next/server" import
import { type NextRequest, NextResponse } from "next/server";
import Script from "next/script";
import { notFound } from "next/navigation";

export function GET(request: NextRequest) {
  const geo = request.geo
  const ip = request.ip
  return NextResponse.json({ geo, ip })
}
