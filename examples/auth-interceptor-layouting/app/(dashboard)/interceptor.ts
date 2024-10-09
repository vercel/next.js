import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { setTimeout } from "timers/promises";

export default async function intercept(request: NextRequest): Promise<void> {
  await setTimeout(1000);

  if (request.nextUrl.searchParams.has("logged-out")) {
    redirect("/sign-in");
  }
}
