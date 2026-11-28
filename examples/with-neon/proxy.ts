import { hasEnvVars } from "@/lib/utils";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // If the env vars are not set, skip the auth check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return NextResponse.next();
  }

  // Validates the session cookie, refreshes it when needed and redirects
  // unauthenticated users to the login page.
  const { auth } = await import("@/lib/auth/server");
  return auth.middleware({ loginUrl: "/auth/login" })(request);
}

export const config = {
  matcher: [
    /*
     * Match the routes that require a signed-in user.
     * Feel free to modify this pattern to protect more paths.
     */
    "/protected/:path*",
  ],
};
