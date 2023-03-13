// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from "@vercel/turbopack-next/internal/page-server-handler";

// eslint-disable-next-line
import Document from "next/document";
import App from "next/app";
// @ts-expect-error INNER is provided by rust
import * as otherExports from "INNER";

startHandler({
  isDataReq: true,
  App,
  Document,
  Component: () => {},
  otherExports,
});
