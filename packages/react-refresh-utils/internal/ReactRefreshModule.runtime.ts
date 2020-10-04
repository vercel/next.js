import { RefreshRuntimeGlobals } from '../runtime'

declare const self: Window & RefreshRuntimeGlobals

type Dictionary = { [key: string]: unknown }
declare const module: {
  id: string
  __proto__: { exports: unknown }
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
  // Legacy CSS implementations will `eval` browser code in a Node.js context
  // to extract CSS. For backwards compatibility, we need to check we're in a
  // browser context before continuing.
  if (
    typeof self !== 'undefined' &&
    // AMP / No-JS mode does not inject these helpers:
    '$RefreshHelpers$' in self
  ) {
    var currentExports = module.__proto__.exports
    var prevExports = module.hot.data?.prevExports ?? null

    // This cannot happen in MainTemplate because the exports mismatch between
    // templating and execution.
    self.$RefreshHelpers$.registerExportsForReactRefresh(
      currentExports,
      module.id
    )

    // A module can be accepted automatically based on its exports, e.g. when
    // it is a Refresh Boundary.
    if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {
      // Save the previous exports on update so we can compare the boundary
      // signatures.
      module.hot.dispose(function (data) {
        data.prevExports = currentExports
      })
      // Unconditionally accept an update to this module, we'll check if it's
      // still a Refresh Boundary later.
      module.hot.accept()

      // This field is set when the previous version of this module was a
      // Refresh Boundary, letting us know we need to check for invalidation or
      // enqueue an update.
      if (prevExports !== null) {
        // A boundary can become ineligible if its exports are incompatible
        // with the previous exports.
        //
        // For example, if you add/remove/change exports, we'll want to
        // re-execute the importing modules, and force those components to
        // re-render. Similarly, if you convert a class component to a
        // function, we want to invalidate the boundary.
        if (
          self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(
            prevExports,
            currentExports
          )
        ) {
          module.hot.invalidate()
        } else {
          self.$RefreshHelpers$.scheduleUpdate()
        }
      }
    } else {
      // Since we just executed the code for the module, it's possible that the
      // new exports made it ineligible for being a boundary.
      // We only care about the case when we were _previously_ a boundary,
      // because we already accepted this update (accidental side effect).
      var isNoLongerABoundary = prevExports !== null
      if (isNoLongerABoundary) {
        module.hot.invalidate()
      }
    }
  }
}
