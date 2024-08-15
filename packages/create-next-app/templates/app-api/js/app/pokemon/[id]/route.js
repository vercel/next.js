import { NextResponse } from "next/server";
import { withMiddleware } from "@/app/with-middleware";

export const GET = withMiddleware(async (_request, context) => {
  const res = await fetch(
    `https://api.vercel.app/pokemon/${context.params.id}`,
  );
  const pokemon = await res.json();

  return NextResponse.json(pokemon);
});
