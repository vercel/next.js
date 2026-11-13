export { auth as proxy } from "./auth";

// Optionally, skip the proxy on some paths
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
