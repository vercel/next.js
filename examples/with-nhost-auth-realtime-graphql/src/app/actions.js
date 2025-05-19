"use server";

import { createServerSideClient } from "../lib/nhost-server";
import { cookies } from "next/headers";
import { NHOST_REFRESH_TOKEN_KEY } from "@nhost/react/server";
import { NHOST_SESSION_KEY } from "@nhost/nextjs/server";

// fix  Error: Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs/app/api-reference/functions/cookies#options
export async function isAuthenticatedAction(searchParams) {
  const cookieStore = await cookies(); // Get the cookie store from next/headers
  const strSession = cookieStore.get(NHOST_SESSION_KEY)?.value;
  const refreshToken = cookieStore.get(NHOST_REFRESH_TOKEN_KEY)?.value;
  console.log("strSession", strSession);
  console.log("refreshToken", refreshToken);
  console.log("getall", cookieStore.getAll());

  const nhost = await createServerSideClient(searchParams);
  console.log("nhost", nhost);
  const isAuthenticated = await nhost.auth.isAuthenticatedAsync();
  console.log("nhost.auth.isAuthenticatedAsync()", isAuthenticated);
  console.log("nhost.auth.isAuthenticated()", nhost.auth.isAuthenticated());

  const context = nhost.auth.client.interpreter.getSnapshot().context;
  console.log("context", context);
  return isAuthenticated;
}
