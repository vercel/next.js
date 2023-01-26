declare const PAGE: string;

import { adapter, enhanceGlobals } from "next/dist/esm/server/web/adapter";

enhanceGlobals();

var mod = require(".");
var handler = mod.middleware || mod.default;

if (typeof handler !== "function") {
  throw new Error(
    'The Edge Function "pages${page}" must export a `default` function'
  );
}

// @ts-ignore
globalThis._ENTRIES = {
  middleware_edge: {
    default: function (opts: any) {
      return adapter({
        ...opts,
        page: PAGE,
        handler,
      });
    },
  },
};
