import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  publicRoutes: ["/", "/api/getAuthenticatedUserId"],
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/"],
};
