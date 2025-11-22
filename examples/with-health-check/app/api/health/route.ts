import { NextResponse } from "next/server";
import { monitor } from "@/lib/monitor";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await monitor.check();

  // Return 200 for "healthy" and "degraded", 503 for "unhealthy"
  const statusCode = result.status === "unhealthy" ? 503 : 200;

  return NextResponse.json(result, {
    status: statusCode,
  });
}
