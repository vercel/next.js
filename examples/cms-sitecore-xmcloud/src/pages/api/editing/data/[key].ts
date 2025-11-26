import { EditingDataMiddleware } from "@sitecore-jss/sitecore-jss-nextjs/editing";

/**
 * This Next.js API route is used to handle Sitecore editor data storage and retrieval by key
 * on serverless deployment architectures (e.g. Vercel) via the `ServerlessEditingDataService`.
 *
 * The `EditingDataMiddleware` expects this dynamic route name to be '[key]' by default, but can
 * be configured to use something else with the `dynamicRouteKey` option.
 */

// Bump body size limit (1mb by default) and disable response limit for Sitecore editor payloads
// See https://nextjs.org/docs/api-routes/request-helpers#custom-config
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "2mb",
    },
    responseLimit: false,
  },
};

// Wire up the EditingDataMiddleware handler
const handler = new EditingDataMiddleware().getHandler();

export default handler;
