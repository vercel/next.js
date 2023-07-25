// Override chunk URL mapping in the webpack runtime
// https://github.com/webpack/webpack/blob/2738eebc7880835d88c727d364ad37f3ec557593/lib/RuntimeGlobals.js#L204

declare const __webpack_require__: any

const addChunkSuffix =
  (getOriginalChunk: (chunkId: any) => string) => (chunkId: any) => {
    return (
      getOriginalChunk(chunkId) +
      `${
        process.env.NEXT_DEPLOYMENT_ID
          ? `?dpl=${process.env.NEXT_DEPLOYMENT_ID}`
          : ''
      }`
    )
  }

// eslint-disable-next-line no-undef
const getChunkScriptFilename = __webpack_require__.u
const chunkFilenameMap: any = {}

// eslint-disable-next-line no-undef
__webpack_require__.u = addChunkSuffix((chunkId) =>
  encodeURI(chunkFilenameMap[chunkId] || getChunkScriptFilename(chunkId))
)

// eslint-disable-next-line no-undef
const getChunkCssFilename = __webpack_require__.k
// eslint-disable-next-line no-undef
__webpack_require__.k = addChunkSuffix(getChunkCssFilename)

// eslint-disable-next-line no-undef
const getMiniCssFilename = __webpack_require__.miniCssF
// eslint-disable-next-line no-undef
__webpack_require__.miniCssF = addChunkSuffix(getMiniCssFilename)

// Ignore the module ID transform in client.
// eslint-disable-next-line no-undef
// @ts-expect-error TODO: fix type
self.__next_require__ =
  process.env.NODE_ENV !== 'production'
    ? (id: string) => {
        const mod = __webpack_require__(id)
        if (typeof mod === 'object') {
          // Return a proxy to flight client to make sure it's always getting
          // the latest module, instead of being cached.
          return new Proxy(mod, {
            get(_target, prop) {
              return __webpack_require__(id)[prop]
            },
          })
        }

        return mod
      }
    : __webpack_require__

// eslint-disable-next-line no-undef
;(self as any).__next_chunk_load__ = (chunk: string) => {
  if (!chunk) return Promise.resolve()
  const [chunkId, chunkFilePath] = chunk.split(':')
  chunkFilenameMap[chunkId] = chunkFilePath

  // @ts-ignore
  // eslint-disable-next-line no-undef
  return __webpack_chunk_load__(chunkId)
}

export {}
