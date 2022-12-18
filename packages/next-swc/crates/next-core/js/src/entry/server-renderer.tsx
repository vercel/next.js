// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import { IPC } from "@vercel/turbopack-next/ipc/index";

import "next/dist/server/node-polyfill-fetch.js";
import "@vercel/turbopack-next/internal/shims";

import type { IncomingMessage, ServerResponse } from "node:http";

import { renderToHTML, RenderOpts } from "next/dist/server/render";
import RenderResult from "next/dist/server/render-result";
import type { BuildManifest } from "next/dist/server/get-page-files";

import { ServerResponseShim } from "@vercel/turbopack-next/internal/http";
import type { Ipc } from "@vercel/turbopack-next/ipc/index";
import type { RenderData } from "types/turbopack";
import type { ChunkGroup } from "types/next";

import App from "@vercel/turbopack-next/pages/_app";
import Document from "@vercel/turbopack-next/pages/_document";

import Component, * as otherExports from ".";
("TURBOPACK { transition: next-client }");
import chunkGroup from ".";

const ipc = IPC as Ipc<IpcIncomingMessage, IpcOutgoingMessage>;

type IpcIncomingMessage = {
  type: "headers";
  data: RenderData;
};

type IpcOutgoingMessage = {
  type: "result";
  result: string | { body: string; contentType?: string };
};

(async () => {
  while (true) {
    const msg = await ipc.recv();

    let renderData: RenderData;
    switch (msg.type) {
      case "headers": {
        renderData = msg.data;
        break;
      }
      default: {
        console.error("unexpected message type", msg.type);
        process.exit(1);
      }
    }

    const isDataReq = Boolean(
      renderData.query.__nextDataReq || renderData.headers["x-nextjs-data"]
    );
    const res = await runOperation(renderData, isDataReq);

    if (res == null) {
      throw new Error("no render result returned");
    }

    ipc.send({
      type: "result",
      result: {
        contentType: isDataReq ? "application/json" : undefined,
        body: isDataReq ? JSON.stringify(res.pageData) : res.html,
      },
    });
  }
})().catch((err) => {
  ipc.sendError(err);
});

type OperationResult = {
  html: string;
  pageData: Object;
};

async function runOperation(
  renderData: RenderData,
  isDataReq: boolean
): Promise<OperationResult | null> {
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
    buildId: "development",

    /* RenderOptsPartial */
    isDataReq,
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
      loaderFile: "",
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

  if ("getStaticPaths" in otherExports) {
    renderOpts.getStaticPaths = otherExports.getStaticPaths;
  }
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

  const renderResult = await renderToHTML(
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
  );

  const body = renderResult?.toUnchunkedString();
  // TODO(from next.js): change this to a different passing mechanism
  const pageData = (renderOpts as any).pageData;
  // TODO: handle these
  // const sprRevalidate = (renderOpts as any).revalidate;
  // const isNotFound = (renderOpts as any).isNotFound;
  // const isRedirect = (renderOpts as any).isRedirect;

  if (body == null) {
    return null;
  }

  return {
    html: body,
    pageData: pageData,
  };
}
