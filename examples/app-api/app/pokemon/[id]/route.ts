import { NextResponse, NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  const res = await fetch(`https://api.vercel.app/pokemon/${id}`);
  const pokemon = await res.json();

  return NextResponse.json(pokemon);
}
