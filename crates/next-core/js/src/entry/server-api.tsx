// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from "@vercel/turbopack-next/internal/api-server-handler";

import "next/dist/server/node-polyfill-fetch.js";

import * as allExports from ".";
import { apiResolver } from "next/dist/server/api-utils/node";

startHandler(({ request, response, query, params, path }) => {
  const mergedQuery = { ...query, ...params };
  return apiResolver(
    request,
    response,
    mergedQuery,
    allExports,
    {
      previewModeId: "",
      previewModeEncryptionKey: "",
      previewModeSigningKey: "",
    },
    false,
    true,
    path
  );
});
