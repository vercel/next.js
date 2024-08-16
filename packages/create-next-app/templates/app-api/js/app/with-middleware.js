import { NextResponse } from "next/server";

export function withMiddleware(handler) {
  return async (req, ctx) => {
    try {
      console.log(`Middleware: Request to ${req.method} ${req.url}`);

      // Check if the request is coming from an allowed origin
      if (!isAllowedOrigin(req)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Placeholder for authentication logic
      const isAuthenticated = await checkAuth(req);
      if (!isAuthenticated) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Call the original handler
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

function isAllowedOrigin(req) {
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");

  // Allow requests from the same origin
  if (referer && host) {
    const refererUrl = new URL(referer);
    return refererUrl.host === host;
  }

  if (process.env.NODE_ENV === "development" && host?.includes("localhost")) {
    return true;
  }

  return false;
}

async function checkAuth(req) {
  // Placeholder authentication logic
  // You can implement your actual auth check here
  const authToken = req.headers.get("authorization");
  return true; // For now, always return true
}
