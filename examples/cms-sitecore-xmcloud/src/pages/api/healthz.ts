import { HealthcheckMiddleware } from "@sitecore-jss/sitecore-jss-nextjs/monitoring";

/**
 * This Next.js API route is used to handle healthz check request.
 * By default this is used only by Sitecore XM Cloud (when running as editing host),
 * but could be used in other deployment scenarios.
 */

// Wire up the HealthcheckMiddleware handler
const handler = new HealthcheckMiddleware().getHandler();

export default handler;
