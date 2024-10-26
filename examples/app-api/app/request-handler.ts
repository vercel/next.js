import { NextRequest, NextResponse } from "next/server";

type RouteHandler<T = Record<string, string | string[]>> = (
  req: NextRequest,
  ctx: { params: T },
) => Promise<Response> | Response;

// Checks if the incoming request is from an allowed origin
function isAllowedOrigin(req: NextRequest): boolean {
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");

  // Allow requests from the same origin
  if (referer && host) {
    const refererUrl = new URL(referer);
    return refererUrl.host === host;
  }
  
  // Allow requests from localhost (for development)
  if (host?.includes("localhost")) {
    return true;
  }
  // Deny by default
  return false;
}

// Placeholder for actual authentication logic (to be implemented)
async function checkAuth(req: NextRequest): Promise<boolean> {
  const authToken = req.headers.get("authorization");
  console.log({ authToken });

  // Currently returns true for all requests; replace with actual auth logic
  return true;
}

export function requestHandler<T = Record<string, string | string[]>>(
  handler: RouteHandler<T>,
): RouteHandler<T> {
  return async (req: NextRequest, ctx: { params: T }) => {
    try {
      console.log(`Middleware: Request to ${req.method} ${req.url}`);

      // Check if the request is from an allowed origin
      if (!isAllowedOrigin(req)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Placeholder for authentication logic
      const isAuthenticated = await checkAuth(req);
      if (!isAuthenticated) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Call the main handler if all checks pass
      const result = await handler(req, ctx);

      // Log after executing the handler
      console.log(`Middleware: Completed ${req.method} ${req.url}`);

      return result;
    } catch (error) {
      console.error(
        `Middleware: Error in route handler: ${req.method} ${req.url}`,
        error,
      );
      return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 },
      );
    }
  };
}
