import ReactDOMClient from "react-dom/client";
import React, { use } from "react";
import type { ReactElement } from "react";
import { createFromReadableStream } from "next/dist/compiled/react-server-dom-webpack/client";

import { HeadManagerContext } from "next/dist/shared/lib/head-manager-context";

import { initializeHMR } from "@vercel/turbopack-next/dev/client";

initializeHMR({
  assetPrefix: "",
});

globalThis.__next_require__ = (data) => {
  const [client_id] = JSON.parse(data);
  return __turbopack_require__(client_id);
};
globalThis.__next_chunk_load__ = __turbopack_load__;

process.env.__NEXT_NEW_LINK_BEHAVIOR = true;

const appElement = document;

const getCacheKey = () => {
  const { pathname, search } = location;
  return pathname + search;
};

const encoder = new TextEncoder();
let initialServerDataBuffer: string[] | undefined = undefined;
let initialServerDataWriter: ReadableStreamDefaultController | undefined =
  undefined;
let initialServerDataLoaded = false;
let initialServerDataFlushed = false;

function nextServerDataCallback(
  seg: [isBootStrap: 0] | [isNotBootstrap: 1, responsePartial: string]
): number {
  if (seg[0] === 0) {
    initialServerDataBuffer = [];
  } else {
    if (!initialServerDataBuffer)
      throw new Error("Unexpected server data: missing bootstrap script.");

    if (initialServerDataWriter) {
      initialServerDataWriter.enqueue(encoder.encode(seg[1]));
    } else {
      initialServerDataBuffer.push(seg[1]);
    }
  }
  return 0;
}

function nextServerDataRegisterWriter(ctr) {
  if (initialServerDataBuffer) {
    initialServerDataBuffer.forEach((val) => {
      ctr.enqueue(encoder.encode(val));
    });
    if (initialServerDataLoaded && !initialServerDataFlushed) {
      ctr.close();
      initialServerDataFlushed = true;
      initialServerDataBuffer = undefined;
    }
  }

  initialServerDataWriter = ctr;
}

// When `DOMContentLoaded`, we can close all pending writers to finish hydration.
const DOMContentLoaded = function () {
  if (initialServerDataWriter && !initialServerDataFlushed) {
    initialServerDataWriter.close();
    initialServerDataFlushed = true;
    initialServerDataBuffer = undefined;
  }
  initialServerDataLoaded = true;
};
// It's possible that the DOM is already loaded.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", DOMContentLoaded, false);
} else {
  DOMContentLoaded();
}

const nextServerDataLoadingGlobal = (self.__next_f = self.__next_f || []);
nextServerDataLoadingGlobal.forEach(nextServerDataCallback);
nextServerDataLoadingGlobal.push = nextServerDataCallback;

function createResponseCache() {
  return new Map();
}
const rscCache = createResponseCache();

function useInitialServerResponse(cacheKey: string) {
  const response = rscCache.get(cacheKey);
  if (response) return response;

  const readable = new ReadableStream({
    start(controller) {
      nextServerDataRegisterWriter(controller);
    },
  });

  const newResponse = createFromReadableStream(readable);

  rscCache.set(cacheKey, newResponse);
  return newResponse;
}

function ServerRoot({ cacheKey }: { cacheKey: string }) {
  React.useEffect(() => {
    rscCache.delete(cacheKey);
  });
  const response = useInitialServerResponse(cacheKey);
  const root = use(response) as ReactElement;
  return root;
}

function RSCComponent() {
  const cacheKey = getCacheKey();
  return <ServerRoot cacheKey={cacheKey} />;
}

function hydrate() {
  const reactEl = (
    <React.StrictMode>
      <HeadManagerContext.Provider
        value={{
          appDir: true,
        }}
      >
        <RSCComponent />
      </HeadManagerContext.Provider>
    </React.StrictMode>
  );

  const isError = document.documentElement.id === "__next_error__";
  if (isError) {
    const reactRoot = ReactDOMClient.createRoot(appElement);
    reactRoot.render(reactEl);
  } else {
    React.startTransition(() => {
      ReactDOMClient.hydrateRoot(appElement, reactEl);
    });
  }
}

window.next = {
  version: "turbo",
  appDir: true,
};

hydrate();
