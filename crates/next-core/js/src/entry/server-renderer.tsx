import type { IncomingMessage, ServerResponse } from "node:http";

import "@vercel/turbopack-next/internal/shims";
import "next/dist/server/node-polyfill-fetch.js";
import { renderToHTML } from "next/dist/server/render";
import type { RenderOpts } from "next/dist/server/render";
import type { RenderData } from "types/turbopack";
import { ServerResponseShim } from "@vercel/turbopack-next/internal/http";

import App from "@vercel/turbopack-next/pages/_app";
import Document from "@vercel/turbopack-next/pages/_document";

import Component, * as otherExports from ".";
("TURBOPACK { transition: next-client }");
import chunkGroup from ".";
import type { BuildManifest } from "next/dist/server/get-page-files";
import type { ChunkGroup } from "types/next";

const [MARKER, _OPERATION_STEP, OPERATION_SUCCESS, _OPERATION_ERROR] =
  process.argv.slice(2, 6).map((arg) => Buffer.from(arg, "utf8"));

const NEW_LINE = "\n".charCodeAt(0);
const OPERATION_SUCCESS_MARKER = Buffer.concat([
  OPERATION_SUCCESS,
  Buffer.from(" ", "utf8"),
  MARKER,
]);

process.stdout.write("READY\n");

const buffer: Buffer[] = [];
process.stdin.on("data", async (data) => {
  let idx = data.indexOf(NEW_LINE);
  while (idx >= 0) {
    buffer.push(data.slice(0, idx));
    try {
      const json = JSON.parse(Buffer.concat(buffer).toString("utf-8"));
      buffer.length = 0;
      const result = await operation(json);
      console.log(`RESULT=${JSON.stringify(result)}`);
    } catch (e: any) {
      console.log(`ERROR=${JSON.stringify(e.stack)}`);
    }
    console.log(OPERATION_SUCCESS_MARKER.toString("utf8"));
    data = data.slice(idx + 1);
    idx = data.indexOf(NEW_LINE);
  }
  buffer.push(data);
});

type QueryValue = string | QueryValue[] | Query;
interface Query {
  [key: string]: QueryValue;
}

type HeaderValue = string | string[];

async function operation(renderData: RenderData) {
  // TODO(alexkirsz) This is missing *a lot* of data, but it's enough to get a
  // basic render working.

  const group = chunkGroup as ChunkGroup;
  const buildManifest: BuildManifest = {
    pages: {
      // TODO(alexkirsz) We should separate _app and page chunks. Right now, we
      // computing the chunk items of `next-hydrate.js`, so they contain both
      // _app and page chunks.
      "/_app": [],
      [renderData.path]: group,
    },

    devFiles: [],
    ampDevFiles: [],
    polyfillFiles: [],
    lowPriorityFiles: [],
    rootMainFiles: [],
    ampFirstPages: [],
  };

  const renderOpts: RenderOpts = {
    /* LoadComponentsReturnType */
    Component,
    App,
    Document,
    pageConfig: {},
    buildManifest,
    reactLoadableManifest: {},
    ComponentMod: {
      default: Component,
      ...otherExports,
    },
    pathname: renderData.path,
    buildId: "",

    /* RenderOptsPartial */
    runtimeConfig: {},
    assetPrefix: "",
    canonicalBase: "",
    previewProps: {
      previewModeId: "",
      previewModeEncryptionKey: "",
      previewModeSigningKey: "",
    },
    basePath: "",
    optimizeFonts: false,
    optimizeCss: false,
    nextScriptWorkers: false,
    images: {
      deviceSizes: [],
      imageSizes: [],
      loader: "default",
      path: "",
      domains: [],
      disableStaticImages: false,
      minimumCacheTTL: 0,
      formats: [],
      dangerouslyAllowSVG: false,
      contentSecurityPolicy: "",
      remotePatterns: [],
      unoptimized: true,
    },
  };

  if ("getStaticProps" in otherExports) {
    renderOpts.getStaticProps = otherExports.getStaticProps;
  }
  if ("getServerSideProps" in otherExports) {
    renderOpts.getServerSideProps = otherExports.getServerSideProps;
  }

  const req: IncomingMessage = {
    url: renderData.url,
    method: "GET",
    headers: renderData.headers,
  } as any;
  const res: ServerResponse = new ServerResponseShim(req) as any;
  const query = { ...renderData.query, ...renderData.params };

  return (
    await renderToHTML(
      /* req: IncomingMessage */
      req,
      /* res: ServerResponse */
      res,
      /* pathname: string */
      renderData.path,
      /* query: ParsedUrlQuery */
      query,
      /* renderOpts: RenderOpts */
      renderOpts
    )
  )?.toUnchunkedString();
}
