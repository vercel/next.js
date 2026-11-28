import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Next.js config options here */
};

export default withSentryConfig(nextConfig, {
  /* Sentry config options here */
  //https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
  org: "your-org-slug",
  project: "your-project",

  authToken: process.env.SENTRY_AUTH_TOKEN,
});
