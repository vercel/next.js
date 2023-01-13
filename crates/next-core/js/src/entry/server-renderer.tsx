// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import { IPC } from "@vercel/turbopack-next/ipc/index";

import "next/dist/server/node-polyfill-fetch.js";
import "@vercel/turbopack-next/internal/shims";

import type { IncomingMessage, ServerResponse } from "node:http";

import { renderToHTML, RenderOpts } from "next/dist/server/render";
import type { BuildManifest } from "next/dist/server/get-page-files";
import type { ReactLoadableManifest } from "next/dist/server/load-components";

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
        body:
          isDataReq && res.pageData != null
            ? JSON.stringify(res.pageData)
            : res.html,
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

  // When rendering a data request, the default component export is eliminated
  // by the Next.js strip export transform. The following checks for this case
  // and replaces the default export with a dummy component instead.
  const comp =
    typeof Component === "undefined" ||
    (typeof Component === "object" && Object.keys(Component).length === 0)
      ? () => {}
      : Component;

  const renderOpts: RenderOpts = {
    /* LoadComponentsReturnType */
    Component: comp,
    App,
    Document,
    pageConfig: {},
    buildManifest,
    reactLoadableManifest: createReactLoadableManifestProxy(),
    ComponentMod: {
      default: comp,
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
    resolvedUrl: renderData.url,
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

type ManifestItem = {
  id: string;
  chunks: string[];
};

/**
 * During compilation, Next.js builds a manifest of dynamic imports with the
 * `ReactLoadablePlugin` for webpack.
 *
 * At the same time, the next/dynamic transform converts each `dynamic()` call
 * so it contains a key to the corresponding entry within that manifest.
 *
 * During server-side rendering, each `dynamic()` call will be recorded and its
 * corresponding entry in the manifest will be looked up.
 * * The entry's chunks will be asynchronously loaded on the client using a
 *   <script defer> tag.
 * * The entry's module id will be appended to a list of dynamic module ids.
 *
 * On the client-side, during hydration, the dynamic module ids are used to
 * initialize the corresponding <Loadable> components.
 *
 * In development, Turbopack works differently: instead of building a static
 * manifest, each `dynamic()` call will embed its own manifest entry within a
 * serialized string key. Hence the need for a proxy that can dynamically
 * deserialize the manifest entries from that string key.
 */
function createReactLoadableManifestProxy(): ReactLoadableManifest {
  return new Proxy(
    {},
    {
      get: (_target, prop: string, _receiver) => {
        const { id, chunks } = JSON.parse(prop) as ManifestItem;

        return {
          id,
          files: chunks.map((chunk) => {
            // Turbopack prefixes chunks with "_next/", but Next.js expects
            // them to be relative to the build directory.
            if (chunk.startsWith("_next/")) {
              return chunk.slice("_next/".length);
            }
            return chunk;
          }),
        };
      },
    }
  );
}
