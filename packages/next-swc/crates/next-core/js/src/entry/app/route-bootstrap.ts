// PAGE is set from rust code
declare const PAGE: string;
// PATHNAME is set from rust code
declare const PATHNAME: string;

import { HandlerProvider } from "next/dist/build/webpack/loaders/next-edge-app-route-loader/provider";
import { adapter, enhanceGlobals } from "next/dist/server/web/adapter";

// For each of the route kinds, import the route so we can pass it to the
// HandlerProvider.
// @ts-expect-error - ROUTE is set from rust code
import { Route } from "ROUTE";

import { requestAsyncStorage } from "next/dist/client/components/request-async-storage";
import { staticGenerationAsyncStorage } from "next/dist/client/components/static-generation-async-storage";

import * as headerHooks from "next/dist/client/components/headers";
import * as serverHooks from "next/dist/client/components/hooks-server-context";
import { staticGenerationBailout } from "next/dist/client/components/static-generation-bailout";

enhanceGlobals();

import * as userland from "ENTRY";

const route = new Route({
  userland,
  pathname: PATHNAME,
  resolvedPagePath: `app/${PAGE}`,
  nextConfigOutput: undefined,
  requestAsyncStorage,
  staticGenerationAsyncStorage,
  staticGenerationBailout,
  headerHooks,
  serverHooks,
});

const provider = new HandlerProvider(route);

// @ts-ignore
globalThis._ENTRIES = {
  middleware_edge: {
    default: function (opts: any) {
      return adapter({
        ...opts,
        page: `/${PAGE}`,
        handler: provider.handler.bind(provider),
      });
    },
  },
};
