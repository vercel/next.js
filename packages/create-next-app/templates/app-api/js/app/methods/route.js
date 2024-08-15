import { NextResponse } from "next/server";
import { methods } from "./methods";

export async function GET(request) {
  const url = request.nextUrl.toString();
  const apis = methods.map((method) => {
    return { path: `${url}/${method}`, description: `${method} method` };
  });

  return NextResponse.json(apis);
}
