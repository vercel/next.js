'use strict'
Object.defineProperty(exports, '__esModule', {
  value: true,
})
exports.hydrate = hydrate
exports.version = void 0
var _interop_require_default =
  require('@swc/helpers/lib/_interop_require_default.js').default
require('../build/polyfills/polyfill-module')
var _client = _interop_require_default(require('react-dom/client'))
var _react = _interop_require_default(require('react'))
var _reactServerDomWebpack = require('next/dist/compiled/react-server-dom-webpack')
// eslint-disable-next-line no-undef
const getChunkScriptFilename = __webpack_require__.u
const chunkFilenameMap = {}
// eslint-disable-next-line no-undef
__webpack_require__.u = (chunkId) => {
  return chunkFilenameMap[chunkId] || getChunkScriptFilename(chunkId)
}
// Ignore the module ID transform in client.
// eslint-disable-next-line no-undef
// @ts-expect-error TODO: fix type
self.__next_require__ = __webpack_require__
self.__next_chunk_load__ = (chunk) => {
  if (!chunk) return Promise.resolve()
  const [chunkId, chunkFileName] = chunk.split(':')
  chunkFilenameMap[chunkId] = `static/chunks/${chunkFileName}.js`
  // @ts-ignore
  // eslint-disable-next-line no-undef
  return __webpack_chunk_load__(chunkId)
}
const version = '12.2.6-canary.10'
exports.version = version
const appElement = document
const getCacheKey = () => {
  const { pathname, search } = location
  return pathname + search
}
const encoder = new TextEncoder()
let initialServerDataBuffer = undefined
let initialServerDataWriter = undefined
let initialServerDataLoaded = false
let initialServerDataFlushed = false
function nextServerDataCallback(seg) {
  if (seg[0] === 0) {
    initialServerDataBuffer = []
  } else {
    if (!initialServerDataBuffer)
      throw new Error('Unexpected server data: missing bootstrap script.')
    if (initialServerDataWriter) {
      initialServerDataWriter.enqueue(encoder.encode(seg[2]))
    } else {
      initialServerDataBuffer.push(seg[2])
    }
  }
}
// There might be race conditions between `nextServerDataRegisterWriter` and
// `DOMContentLoaded`. The former will be called when React starts to hydrate
// the root, the latter will be called when the DOM is fully loaded.
// For streaming, the former is called first due to partial hydration.
// For non-streaming, the latter can be called first.
// Hence, we use two variables `initialServerDataLoaded` and
// `initialServerDataFlushed` to make sure the writer will be closed and
// `initialServerDataBuffer` will be cleared in the right time.
function nextServerDataRegisterWriter(ctr) {
  if (initialServerDataBuffer) {
    initialServerDataBuffer.forEach((val) => {
      ctr.enqueue(encoder.encode(val))
    })
    if (initialServerDataLoaded && !initialServerDataFlushed) {
      ctr.close()
      initialServerDataFlushed = true
      initialServerDataBuffer = undefined
    }
  }
  initialServerDataWriter = ctr
}
// When `DOMContentLoaded`, we can close all pending writers to finish hydration.
const DOMContentLoaded = function () {
  if (initialServerDataWriter && !initialServerDataFlushed) {
    initialServerDataWriter.close()
    initialServerDataFlushed = true
    initialServerDataBuffer = undefined
  }
  initialServerDataLoaded = true
}
// It's possible that the DOM is already loaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', DOMContentLoaded, false)
} else {
  DOMContentLoaded()
}
const nextServerDataLoadingGlobal = (self.__next_s = self.__next_s || [])
nextServerDataLoadingGlobal.forEach(nextServerDataCallback)
nextServerDataLoadingGlobal.push = nextServerDataCallback
function createResponseCache() {
  return new Map()
}
const rscCache = createResponseCache()
function useInitialServerResponse(cacheKey) {
  const response = rscCache.get(cacheKey)
  if (response) return response
  const readable = new ReadableStream({
    start(controller) {
      nextServerDataRegisterWriter(controller)
    },
  })
  const newResponse = (0, _reactServerDomWebpack).createFromReadableStream(
    readable
  )
  rscCache.set(cacheKey, newResponse)
  return newResponse
}
function ServerRoot({ cacheKey }) {
  _react.default.useEffect(() => {
    rscCache.delete(cacheKey)
  })
  const response = useInitialServerResponse(cacheKey)
  const root = response.readRoot()
  return root
}
function Root({ children }) {
  if (process.env.__NEXT_TEST_MODE) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    _react.default.useEffect(() => {
      window.__NEXT_HYDRATED = true
      if (window.__NEXT_HYDRATED_CB) {
        window.__NEXT_HYDRATED_CB()
      }
    }, [])
  }
  return children
}
function RSCComponent(props) {
  const cacheKey = getCacheKey()
  return /*#__PURE__*/ _react.default.createElement(
    ServerRoot,
    Object.assign({}, props, {
      cacheKey: cacheKey,
    })
  )
}
function hydrate() {
  const reactEl = /*#__PURE__*/ _react.default.createElement(
    _react.default.StrictMode,
    null,
    /*#__PURE__*/ _react.default.createElement(
      Root,
      null,
      /*#__PURE__*/ _react.default.createElement(RSCComponent, null)
    )
  )
  const isError = document.documentElement.id === '__next_error__'
  const reactRoot = isError
    ? _client.default.createRoot(appElement)
    : _client.default.hydrateRoot(appElement, reactEl)
  if (isError) {
    reactRoot.render(reactEl)
  }
}

if (
  (typeof exports.default === 'function' ||
    (typeof exports.default === 'object' && exports.default !== null)) &&
  typeof exports.default.__esModule === 'undefined'
) {
  Object.defineProperty(exports.default, '__esModule', { value: true })
  Object.assign(exports.default, exports)
  module.exports = exports.default
}

//# sourceMappingURL=app-index.js.map
