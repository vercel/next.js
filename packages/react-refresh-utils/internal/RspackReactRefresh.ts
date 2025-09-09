import RefreshHelpers from './helpers'

declare const __webpack_require__: {
  c: Record<string | number, { exports: unknown | (() => Promise<unknown>) }>
}

// Extracts exports from a webpack module object.
function getModuleExports(moduleId: string) {
  if (typeof moduleId === 'undefined') {
    // `moduleId` is unavailable, which indicates that this module is not in the cache,
    // which means we won't be able to capture any exports,
    // and thus they cannot be refreshed safely.
    // These are likely runtime or dynamically generated modules.
    return {}
  }

  var maybeModule = __webpack_require__.c[moduleId]
  if (typeof maybeModule === 'undefined') {
    // `moduleId` is available but the module in cache is unavailable,
    // which indicates the module is somehow corrupted (e.g. broken Webpacak `module` globals).
    // We will warn the user (as this is likely a mistake) and assume they cannot be refreshed.
    console.warn(
      '[React Refresh] Failed to get exports for module: ' + moduleId + '.'
    )
    return {}
  }

  var exportsOrPromise = maybeModule.exports
  if (typeof Promise !== 'undefined' && exportsOrPromise instanceof Promise) {
    return exportsOrPromise.then(function (exports) {
      return exports
    })
  }
  return exportsOrPromise
}

function executeRuntime(moduleExports, moduleId, webpackHot) {
  RefreshHelpers.registerExportsForReactRefresh(moduleExports, moduleId)

  if (webpackHot) {
    var isHotUpdate = !!webpackHot.data
    var prevExports
    if (isHotUpdate) {
      prevExports = webpackHot.data.prevExports
    }

    if (RefreshHelpers.isReactRefreshBoundary(moduleExports)) {
      webpackHot.dispose(
        // A callback to performs a full refresh if React has unrecoverable errors,
        // and also caches the to-be-disposed module.
        function hotDisposeCallback(data) {
          // We have to mutate the data object to get data registered and cached
          data.prevExports = moduleExports
        }
      )
      webpackHot.accept()

      if (isHotUpdate) {
        if (
          RefreshHelpers.isReactRefreshBoundary(prevExports) &&
          RefreshHelpers.shouldInvalidateReactRefreshBoundary(
            prevExports,
            moduleExports
          )
        ) {
          webpackHot.invalidate()
        } else {
          RefreshHelpers.scheduleUpdate()
        }
      }
    } else {
      if (isHotUpdate && typeof prevExports !== 'undefined') {
        webpackHot.invalidate()
      }
    }
  }
}

// Port from https://github.com/pmmmwh/react-refresh-webpack-plugin/blob/main/loader/utils/getRefreshModuleRuntime.js#L29
export function refresh(moduleId, webpackHot) {
  const currentExports = getModuleExports(moduleId)
  const fn = (exports) => {
    executeRuntime(exports, moduleId, webpackHot)
  }
  if (typeof Promise !== 'undefined' && currentExports instanceof Promise) {
    currentExports.then(fn)
  } else {
    fn(currentExports)
  }
}

export {
  register,
  createSignatureFunctionForTransform,
} from 'react-refresh/runtime'
