import "@vercel/turbopack-next/internal/shims-client";

import { initialize, hydrate } from "next/dist/client";
import { initializeHMR } from "@vercel/turbopack-next/dev/client";
import { subscribeToCssChunkUpdates } from "@vercel/turbopack-next/dev/hmr-client";

import * as _app from "@vercel/turbopack-next/pages/_app";
import * as page from ".";

async function loadPageChunk(assetPrefix: string, chunkPath: string) {
  const fullPath = assetPrefix + chunkPath;

  await __turbopack_load__(fullPath);

  // TODO: the turbopack chunk loader should do this somehow
  if (chunkPath.endsWith(".css")) {
    const link = document.querySelector<HTMLLinkElement>(
      `link[href=${JSON.stringify(fullPath)}]`
    );
    if (!link) {
      throw new Error("stylesheet should be loaded, but is not");
    }

    subscribeToCssChunkUpdates(assetPrefix, link);
  }
}

(async () => {
  console.debug("Initializing Next.js");

  const { assetPrefix } = await initialize({
    webpackHMR: {
      // Expected when `process.env.NODE_ENV === 'development'`
      onUnrecoverableError() {},
    },
  });

  initializeHMR({
    assetPrefix,
  });

  // for the page loader
  window.__turbopack_load_page_chunks__ = (page, paths) => {
    const chunkPromises = paths.map(loadPageChunk.bind(null, assetPrefix));

    Promise.all(chunkPromises).catch((err) =>
      console.error("failed to load chunks for page " + page, err)
    );
  };

  const pagePath = window.__NEXT_DATA__.page;
  window.__BUILD_MANIFEST = {
    [pagePath]: [],
    __rewrites: {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    } as any,
    sortedPages: [pagePath, "/_app"],
  };

  window.__NEXT_P.push(["/_app", () => _app]);
  window.__NEXT_P.push([pagePath, () => page]);

  console.debug("Hydrating the page");

  await hydrate({});

  console.debug("The page has been hydrated");
})().catch((err) => console.error(err));
