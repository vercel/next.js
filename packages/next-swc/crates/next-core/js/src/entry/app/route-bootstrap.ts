// PAGE is set from rust code
declare const PAGE: string;
// PATHNAME is set from rust code
declare const PATHNAME: string;

import { EdgeModuleWrapper } from "next/dist/build/webpack/loaders/next-edge-app-route-loader/edge-module-wrapper";

// @ts-expect-error - ROUTE_MODULE is set from rust code
import RouteModule from "ROUTE_MODULE";

import * as userland from "ENTRY";

// TODO: (wyattjoh) - perform the option construction in Rust to allow other modules to accept different options
const routeModule = new RouteModule({
  userland,
  pathname: PATHNAME,
  resolvedPagePath: `app/${PAGE}`,
  nextConfigOutput: undefined,
});

// @ts-expect-error - exposed for edge support
globalThis._ENTRIES = {
  middleware_edge: {
    default: EdgeModuleWrapper.wrap(routeModule, { page: `/${PAGE}` }),
  },
};
