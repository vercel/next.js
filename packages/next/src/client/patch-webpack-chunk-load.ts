import { retryChunkLoadError } from './components/chunk-load-error/retry-chunk-load-error'

type ChunkLoad = ((...args: any[]) => Promise<any>) & {
  [patched]?: true
}

declare const __webpack_require__: {
  e?: ChunkLoad
  [patched]?: true
}
declare let __webpack_chunk_load__: ChunkLoad | undefined

const patched = Symbol.for('next.webpack.chunk-load.retry.patched')

function markPatched(load: ChunkLoad): ChunkLoad {
  load[patched] = true
  return load
}

function wrapChunkLoad(load: ChunkLoad): ChunkLoad {
  // Webpack can reject from either the low-level script loader or the higher-level
  // ensureChunk Promise. `retryChunkLoadError()` tags exhausted errors so these
  // wrappers can compose without multiplying retries.
  return markPatched((...args: any[]) =>
    retryChunkLoadError(() => load(...args))
  )
}

export function patchWebpackChunkLoad() {
  if (__webpack_require__[patched]) {
    return
  }

  const originalChunkLoad =
    typeof __webpack_chunk_load__ === 'function' ? __webpack_chunk_load__ : null
  const originalEnsureChunk =
    typeof __webpack_require__.e === 'function' ? __webpack_require__.e : null

  if (originalChunkLoad && !originalChunkLoad[patched]) {
    const wrappedChunkLoad = wrapChunkLoad(originalChunkLoad)
    __webpack_chunk_load__ = wrappedChunkLoad

    if (originalEnsureChunk === originalChunkLoad) {
      __webpack_require__.e = wrappedChunkLoad
    }
  }

  if (
    originalEnsureChunk &&
    originalEnsureChunk !== originalChunkLoad &&
    !originalEnsureChunk[patched]
  ) {
    __webpack_require__.e = wrapChunkLoad(originalEnsureChunk)
  }

  __webpack_require__[patched] = true
}
