import type { RefreshRuntimeGlobals } from '../runtime'

declare const self: Window & RefreshRuntimeGlobals

type Dictionary = { [key: string]: unknown }
declare const __webpack_module__: {
  id: string
  exports: unknown
  hot: {
    accept: () => void
    dispose: (onDispose: (data: Dictionary) => void) => void
    invalidate: () => void
    data?: Dictionary
  }
}

// This function gets unwrapped into global scope, which is why we don't invert
// if-blocks. Also, you cannot use `return`.
export default function () {
  // Wrapped in an IIFE to avoid polluting the global scope
  ;(function () {
    // Legacy CSS implementations will `eval` browser code in a Node.js context
    // to extract CSS. For backwards compatibility, we need to check we're in a
    // browser context before continuing.
    if (
      typeof self !== 'undefined' &&
      // No-JS mode does not inject these helpers:
      '$RefreshHelpers$' in self
    ) {
      // @ts-ignore __webpack_module__ is global
      var currentExports = __webpack_module__.exports
      // @ts-ignore __webpack_module__ is global
      var prevSignature: unknown[] | null =
        __webpack_module__.hot.data?.prevSignature ?? null

      // This cannot happen in MainTemplate because the exports mismatch between
      // templating and execution.
      self.$RefreshHelpers$.registerExportsForReactRefresh(
        currentExports,
        __webpack_module__.id
      )

      // A module can be accepted automatically based on its exports, e.g. when
      // it is a Refresh Boundary.
      if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {
        // Save the previous exports signature on update so we can compare the boundary
        // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)
        __webpack_module__.hot.dispose(function (data) {
          data.prevSignature =
            self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports)
        })
        // Unconditionally accept an update to this module, we'll check if it's
        // still a Refresh Boundary later.
        // @ts-ignore importMeta is replaced in the loader
        global.importMeta.webpackHot.accept()

        // This field is set when the previous version of this module was a
        // Refresh Boundary, letting us know we need to check for invalidation or
        // enqueue an update.
        if (prevSignature !== null) {
          // A boundary can become ineligible if its exports are incompatible
          // with the previous exports.
          //
          // For example, if you add/remove/change exports, we'll want to
          // re-execute the importing modules, and force those components to
          // re-render. Similarly, if you convert a class component to a
          // function, we want to invalidate the boundary.
          if (
            self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(
              prevSignature,
              self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports)
            )
          ) {
            __webpack_module__.hot.invalidate()
          } else {
            self.$RefreshHelpers$.scheduleUpdate()
          }
        }
      } else {
        // Since we just executed the code for the module, it's possible that the
        // new exports made it ineligible for being a boundary.
        // We only care about the case when we were _previously_ a boundary,
        // because we already accepted this update (accidental side effect).
        var isNoLongerABoundary = prevSignature !== null
        if (isNoLongerABoundary) {
          __webpack_module__.hot.invalidate()
        }
      }
    }
  })()
}
