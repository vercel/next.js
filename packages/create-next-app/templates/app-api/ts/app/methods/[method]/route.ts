import { NextResponse } from "next/server";
import { methods } from "../methods";
import { withMiddleware } from "@/app/with-middleware";

export const GET = withMiddleware(
  async (request, context: { params: { method: string } }) => {
    const method = context.params.method.toUpperCase();
    if (!methods.includes(method)) {
      return NextResponse.json(
        { error: `Method ${method} is not supported.` },
        { status: 404 },
      );
    }

    if (method === "GET") {
      return NextResponse.json({ method: "GET" });
    }

    const url = request.nextUrl.toString();
    const res = await fetch(url, { method });

    // if method is HEAD, body is null
    if (method === "HEAD") {
      const { ok, statusText, status, body } = res;
      return NextResponse.json({
        ok,
        statusText,
        status,
        body,
      });
    }

    const data = await res.json();
    return NextResponse.json(data);
  },
);

export async function POST() {
  return NextResponse.json({ method: "POST" });
}

export async function PUT() {
  return NextResponse.json({ method: "PUT" });
}

export async function DELETE() {
  return NextResponse.json({ method: "DELETE" });
}

export async function PATCH() {
  return NextResponse.json({ method: "PATCH" });
}

export async function OPTIONS() {
  return NextResponse.json({ method: "OPTIONS" });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
