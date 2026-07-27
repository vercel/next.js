import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  const { slug } = await params;
  return NextResponse.json({ message: `Hello ${slug}!` });
}
