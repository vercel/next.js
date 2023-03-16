declare const PAGE: string;

import { adapter, enhanceGlobals } from "next/dist/server/web/adapter";
import { getHandle } from "next/dist/build/webpack/loaders/next-edge-app-route-loader/handle";

import { staticGenerationAsyncStorage } from "next/dist/client/components/static-generation-async-storage";
import * as serverHooks from "next/dist/client/components/hooks-server-context";
import { staticGenerationBailout } from "next/dist/client/components/static-generation-bailout";
import * as headerHooks from "next/dist/client/components/headers";
import { requestAsyncStorage } from "next/dist/client/components/request-async-storage";

enhanceGlobals();

// @ts-expect-error ENTRY is set from rust code
import * as handlers from "ENTRY";
const mod = {
  handlers,
  resolvedPagePath: `app/${PAGE}`,
  staticGenerationAsyncStorage,
  serverHooks,
  staticGenerationBailout,
  headerHooks,
  requestAsyncStorage,
};
const handler = getHandle({
  mod,
  page: `/${PAGE}`,
});

// @ts-ignore
globalThis._ENTRIES = {
  middleware_edge: {
    default: function (opts: any) {
      return adapter({
        ...opts,
        page: `/${PAGE}`,
        handler,
      });
    },
  },
};
