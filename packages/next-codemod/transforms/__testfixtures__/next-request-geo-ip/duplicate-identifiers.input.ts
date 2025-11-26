// @ts-nocheck
import { type NextRequest, NextResponse } from "next/server";

// for duplicate identifier testing
function ipAddress1() {
  return "127.0.0.1";
}
const ipAddress2 = "127.0.0.1";

export function GET(request: NextRequest) {
  const ipAddress = request.ip;
  return NextResponse.json({ ipAddress });
}
