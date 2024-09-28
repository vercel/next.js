// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

import { ipAddress as ipAddress3 } from "@vercel/functions";

// for duplicate identifier testing
function ipAddress1() {
  return "127.0.0.1";
}
const ipAddress2 = "127.0.0.1";

export function GET(request: NextRequest) {
  const ipAddress = ipAddress3(request);
  return NextResponse.json({ ipAddress });
}
