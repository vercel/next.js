import { createSdk, session } from "@descope/nextjs-sdk/server";

const sdk = createSdk({
  projectId: process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID,
  baseUrl: process.env.NEXT_PUBLIC_DESCOPE_BASE_URL,
  managementKey: process.env.DESCOPE_MANAGEMENT_KEY,
});

export async function GET() {
  const currentSession = session();
  if (!currentSession) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!sdk.management) {
    console.error(
      "Management SDK is not available, Make sure you have the DESCOPE_MANAGEMENT_KEY environment variable set"
    );
    return new Response("Internal error", { status: 500 });
  }

  const res = await sdk.management.user.loadByUserId(currentSession.token.sub!);
  if (!res.ok) {
    console.error("Failed to load user", res.error);
    return new Response("Not found", { status: 404 });
  }
  return new Response(JSON.stringify(res.data), { status: 200 });
}
