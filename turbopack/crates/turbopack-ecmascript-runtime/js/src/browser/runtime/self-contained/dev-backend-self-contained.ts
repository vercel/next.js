/**
 * This file contains the development-mode runtime code specific to the
 * Turbopack self-contained ECMAScript runtime (no runtime chunk loading,
 * `globalThis`/`self` only, no DOM). Used for the Edge execution environment
 * and for single-chunk (service-worker) bundles.
 *
 * It will be appended to the base development runtime code.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../../../shared/runtime/dev-protocol.d.ts" />
/// <reference path="../base/runtime-base.ts" />
/// <reference path="../base/dev-base.ts" />
/// <reference path="../../../shared/require-type.d.ts" />

let DEV_BACKEND: DevRuntimeBackend
;(() => {
  DEV_BACKEND = {
    restart: () => {
      throw new Error('restart is not supported ' + new Error().stack)
    },
  }
})()

function _eval({ code, url, map }: EcmascriptModuleEntry): ModuleFactory {
  code += `\n\n//# sourceURL=${encodeURI(
    location.origin + CHUNK_BASE_PATH + url + ASSET_SUFFIX
  )}`
  if (map) {
    code += `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${btoa(
      // btoa doesn't handle nonlatin characters, so escape them as \x sequences
      // See https://stackoverflow.com/a/26603875
      unescape(encodeURIComponent(map))
    )}`
  }

  // eslint-disable-next-line no-eval
  return eval(code)
}
