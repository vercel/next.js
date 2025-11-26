/**
 * This file contains the runtime code specific to the Turbopack development
 * ECMAScript "None" runtime (e.g. for Edge).
 *
 * It will be appended to the base development runtime code.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../base/dev-protocol.d.ts" />

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
