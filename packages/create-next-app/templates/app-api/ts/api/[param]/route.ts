import { type NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: { param: string } },
) {
  const { params } = context;
  const { param } = params; // dynamic router

  return new Response(JSON.stringify({ message: `Hello, ${param}` }), {
    headers: { "Content-Type": "application/json" },
  });
}
