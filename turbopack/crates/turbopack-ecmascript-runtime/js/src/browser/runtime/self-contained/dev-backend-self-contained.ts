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

let DEV_BACKEND: DevRuntimeBackend
;(() => {
  DEV_BACKEND = {
    restart: () => {
      throw new Error('restart is not supported')
    },
  }
})()

function _eval(_: EcmascriptModuleEntry) {
  throw new Error('HMR evaluation is not implemented on this backend')
}
