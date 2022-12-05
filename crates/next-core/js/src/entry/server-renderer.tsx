import IPC, { Ipc } from "@vercel/turbopack-next/internal/ipc";

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

    const html = await runOperation(renderData);

    if (html == null) {
      throw new Error("no html returned");
    }

    ipc.send({
      type: "result",
      result: html,
    });
  }
})().catch((err) => {
  ipc.sendError(err);
});

async function runOperation(
  renderData: RenderData
): Promise<string | undefined> {
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
