import "@vercel/turbopack-next/internal/shims-client";

import { initialize, hydrate, router } from "next/dist/client";
import type { Router } from "next/dist/client/router";
import {
  assign,
  urlQueryToSearchParams,
} from "next/dist/shared/lib/router/utils/querystring";
import { formatWithValidation } from "next/dist/shared/lib/router/utils/format-url";
import { initializeHMR } from "@vercel/turbopack-next/dev/client";
import {
  subscribeToUpdate,
  subscribeToCssChunkUpdates,
} from "@vercel/turbopack-next/dev/hmr-client";

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

  // This needs to happen after hydration because the router is initialized
  // during hydration. To make this dependency clearer, we pass `router` as an
  // explicit argument instead of relying on the `router` import binding.
  subscribeToCurrentPageData({ assetPrefix, router });

  console.debug("The page has been hydrated");
})().catch((err) => console.error(err));

/**
 * Subscribes to the current page's data updates from the HMR server.
 *
 * Updates on route change.
 */
function subscribeToCurrentPageData({
  router,
  assetPrefix,
}: {
  router: Router;
  assetPrefix: string;
}) {
  let dataPath = getCurrentPageDataHref();
  let unsubscribe = subscribeToPageData({
    router,
    dataPath,
    assetPrefix,
  });

  router.events.on("routeChangeComplete", () => {
    const nextDataPath = getCurrentPageDataHref();
    if (dataPath === nextDataPath) {
      return;
    }
    dataPath = nextDataPath;

    unsubscribe();
    unsubscribe = subscribeToPageData({
      router,
      dataPath,
      assetPrefix,
    });
  });
}

function getCurrentPageDataHref(): string {
  return router.pageLoader.getDataHref({
    asPath: router.asPath,
    href: formatWithValidation({
      // No need to pass `router.query` when `skipInterpolation` is true.
      pathname: router.pathname,
    }),
    skipInterpolation: true,
  });
}

/**
 * TODO(alexkirsz): Handle assetPrefix/basePath.
 */
function subscribeToPageData({
  router,
  dataPath,
  assetPrefix,
}: {
  router: Router;
  dataPath: string;
  assetPrefix: string;
}): () => void {
  return subscribeToUpdate(
    {
      // We need to remove the leading / from the data path as Turbopack
      // resources are not prefixed with a /.
      path: dataPath.slice(1),
      headers: {
        // This header is used by the Next.js server to determine whether this
        // is a data request.
        "x-nextjs-data": "1",
      },
    },
    (update) => {
      if (update.type !== "restart") {
        return;
      }

      // This triggers a reload of the page data.
      // Adapted from next.js/packages/next/client/next-dev.js.
      router
        .replace(
          router.pathname +
            "?" +
            String(
              assign(
                urlQueryToSearchParams(router.query),
                new URLSearchParams(location.search)
              )
            ),
          router.asPath,
          { scroll: false }
        )
        .catch(() => {
          // trigger hard reload when failing to refresh data
          // to show error overlay properly
          location.reload();
        });
    }
  );
}
