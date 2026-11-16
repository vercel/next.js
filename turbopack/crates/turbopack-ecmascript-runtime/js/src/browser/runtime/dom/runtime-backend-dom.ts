/**
 * This file contains the runtime code specific to the Turbopack ECMAScript DOM runtime.
 *
 * It will be appended to the base runtime code.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../../../browser/runtime/base/runtime-base.ts" />
/// <reference path="../../../shared/runtime/runtime-types.d.ts" />

function getAssetSuffixFromScriptSrc() {
  // TURBOPACK_ASSET_SUFFIX is set in web workers
  if (self.TURBOPACK_ASSET_SUFFIX != null) return self.TURBOPACK_ASSET_SUFFIX
  const src = document?.currentScript?.getAttribute?.('src') ?? ''
  const qi = src.indexOf('?')
  return qi >= 0 ? src.slice(qi) : ''
}

/**
 * Whether a `src` / `href` attribute value refers to `url`: either exactly, or
 * with an additional query string (e.g. `?dpl=...`). Also matches the decoded
 * form of `url`.
 *
 * TODO(PACK-2140): drop the decoded variant once all filenames are guaranteed
 * to be escaped.
 */
function matchesChunkUrl(
  value: string | null,
  url: string,
  decodedUrl: string
): boolean {
  return (
    value != null &&
    (value === url ||
      value.startsWith(url + '?') ||
      value === decodedUrl ||
      value.startsWith(decodedUrl + '?'))
  )
}

// These lookups only search `<head>`: the runtime inserts its chunk tags there,
// and chunk tags rendered into the HTML are expected there too. Tags in
// `<body>` are deliberately ignored, so that the cost of a lookup does not grow
// with the size of the page content. A chunk whose tag is only in `<body>` is
// loaded again through a new tag in `<head>`, and unloading a chunk leaves its
// `<body>` tags in place.
//
// They iterate the tag collection and compare attribute values as plain
// strings. `querySelectorAll` with attribute selectors would need the URL to be
// CSS-escaped.

/**
 * Returns all `<script>` elements in `<head>` whose `src` refers to `url`.
 */
function findChunkScripts(url: string): HTMLScriptElement[] {
  const decodedUrl = decodeURI(url)
  const scripts = document.head.getElementsByTagName('script')
  const result: HTMLScriptElement[] = []
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i]
    if (matchesChunkUrl(script.getAttribute('src'), url, decodedUrl)) {
      result.push(script)
    }
  }
  return result
}

/**
 * Returns all `<link>` elements in `<head>` whose `href` refers to `url`.
 * With `stylesheetsOnly`, only links whose `rel` is exactly `stylesheet`
 * (ASCII case-insensitive) are returned.
 */
function findChunkLinks(
  url: string,
  stylesheetsOnly: boolean = false
): HTMLLinkElement[] {
  const decodedUrl = decodeURI(url)
  const links = document.head.getElementsByTagName('link')
  const result: HTMLLinkElement[] = []
  for (let i = 0; i < links.length; i++) {
    const link = links[i]
    if (
      (!stylesheetsOnly ||
        link.getAttribute('rel')?.toLowerCase() === 'stylesheet') &&
      matchesChunkUrl(link.getAttribute('href'), url, decodedUrl)
    ) {
      result.push(link)
    }
  }
  return result
}

/**
 * Returns all `<link rel=stylesheet>` elements in `<head>` whose `href`
 * refers to `url`.
 */
function findChunkStylesheets(url: string): HTMLLinkElement[] {
  return findChunkLinks(url, true)
}

type ChunkResolver = {
  resolved: boolean
  loadingStarted: boolean
  retryAttempts: number
  resolve: () => void
  reject: (error?: Error) => void
  promise: Promise<any>
}

let BACKEND: RuntimeBackend

/**
 * Maps chunk paths to the corresponding resolver.
 */
const chunkResolvers: Map<ChunkUrl, ChunkResolver> = new Map()

;(() => {
  BACKEND = {
    async registerChunk(chunk, params) {
      // `chunk` is `undefined` for an inlined entry-only registration, which has no source chunk.
      let chunkPath: ChunkPath | undefined
      if (chunk != null) {
        chunkPath = getPathFromScript(chunk)
        const resolver = getOrCreateResolver(getUrlFromScript(chunk))
        resolver.resolve()
      }

      if (params == null) {
        return
      }

      for (const otherChunkData of params.otherChunks) {
        const otherChunkPath = getChunkPath(otherChunkData)
        const otherChunkUrl = getChunkRelativeUrl(otherChunkPath)

        // Chunk might have started loading, so we want to avoid triggering another load.
        getOrCreateResolver(otherChunkUrl)
      }

      // This waits for chunks to be loaded, but also marks included items as available.
      await Promise.all(
        params.otherChunks.map((otherChunkData) =>
          loadInitialChunk(chunkPath, otherChunkData)
        )
      )

      if (params.runtimeModuleIds.length > 0) {
        for (const moduleId of params.runtimeModuleIds) {
          getOrInstantiateRuntimeModule(chunkPath, moduleId)
        }
      }
    },

    /**
     * Loads the given chunk, and returns a promise that resolves once the chunk
     * has been loaded.
     */
    loadChunkCached(sourceType: SourceType, chunkUrl: ChunkUrl) {
      return doLoadChunk(sourceType, chunkUrl)
    },
  }

  function getOrCreateResolver(chunkUrl: ChunkUrl): ChunkResolver {
    let resolver = chunkResolvers.get(chunkUrl)
    if (!resolver) {
      let resolve: () => void
      let reject: (error?: Error) => void
      const promise = new Promise<void>((innerResolve, innerReject) => {
        resolve = innerResolve
        reject = innerReject
      })
      resolver = {
        resolved: false,
        loadingStarted: false,
        retryAttempts: 0,
        promise,
        resolve: () => {
          resolver!.resolved = true
          resolve()
        },
        reject: reject!,
      }
      chunkResolvers.set(chunkUrl, resolver)
    }
    return resolver
  }

  /**
   * Rejects a chunk resolver and drops it from the cache.
   * We don't want to cache failed chunk loads: a later
   * request for the same chunk should try again.
   */
  function rejectChunkResolver(
    chunkUrl: ChunkUrl,
    resolver: ChunkResolver,
    error?: Error
  ) {
    if (chunkResolvers.get(chunkUrl) === resolver) {
      chunkResolvers.delete(chunkUrl)
    }
    resolver.reject(error)
  }

  function getChunkLoadRetryDelayMs() {
    const jitter = Math.floor(
      Math.random() * (CHUNK_LOAD_RETRY_MAX_JITTER_MS + 1)
    )
    return CHUNK_LOAD_RETRY_BASE_DELAY_MS + jitter
  }

  function isRetryableChunkLoadError(error?: Error): boolean {
    return (
      error == null ||
      (error instanceof DOMException && error.name === 'NetworkError')
    )
  }

  /**
   * Handles a failed chunk load: retries the load once after a short delay.
   */
  function onChunkLoadError(
    sourceType: SourceType,
    chunkUrl: ChunkUrl,
    resolver: ChunkResolver,
    error?: Error,
    reload?: () => void
  ) {
    if (
      !isRetryableChunkLoadError(error) ||
      resolver.retryAttempts >= CHUNK_LOAD_RETRY_MAX_ATTEMPTS ||
      chunkResolvers.get(chunkUrl) !== resolver
    ) {
      rejectChunkResolver(chunkUrl, resolver, error)
      return
    }

    resolver.retryAttempts++
    setTimeout(() => {
      // if this chunk is being fetched multiple times, and one of those
      // attempts succeeds. or, if this chunk has another resolver
      // mapped to it - it's safe to skip retrying.
      if (resolver.resolved || chunkResolvers.get(chunkUrl) !== resolver) {
        return
      }
      if (reload) {
        reload()
      } else {
        resolver.loadingStarted = false
        doLoadChunk(sourceType, chunkUrl)
      }
    }, getChunkLoadRetryDelayMs())
  }

  /**
   * Loads the given chunk, and returns a promise that resolves once the chunk
   * has been loaded.
   */
  function doLoadChunk(sourceType: SourceType, chunkUrl: ChunkUrl) {
    const resolver = getOrCreateResolver(chunkUrl)
    if (resolver.loadingStarted) {
      return resolver.promise
    }

    if (sourceType === SourceType.Runtime) {
      // We don't need to load chunks references from runtime code, as they're already
      // present in the DOM.
      resolver.loadingStarted = true

      if (isCss(chunkUrl)) {
        // CSS chunks do not register themselves, and as such must be marked as
        // loaded instantly.
        resolver.resolve()
      }

      // We need to wait for JS chunks to register themselves within `registerChunk`
      // before we can start instantiating runtime modules, hence the absence of
      // `resolver.resolve()` in this branch.

      return resolver.promise
    }

    if (typeof importScripts === 'function') {
      // We're in a web worker
      if (isCss(chunkUrl)) {
        // ignore
      } else if (isJs(chunkUrl)) {
        self.TURBOPACK_NEXT_CHUNK_URLS!.push(chunkUrl)
        try {
          importScripts(chunkUrl)
        } catch (error) {
          onChunkLoadError(sourceType, chunkUrl, resolver, error as Error)
        }
      } else {
        throw new Error(
          `can't infer type of chunk from URL ${chunkUrl} in worker`
        )
      }
    } else {
      if (isCss(chunkUrl)) {
        const previousLinks = findChunkStylesheets(chunkUrl)
        if (previousLinks.length > 0) {
          // CSS chunks do not register themselves, and as such must be marked as
          // loaded instantly.
          resolver.resolve()
        } else {
          const createLink = () => {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.crossOrigin = CROSS_ORIGIN
            link.href = chunkUrl
            link.onerror = () => {
              // Re-insert a fresh tag at the same position on retry to preserve
              // cascade order.
              const anchor = document.createComment('')
              link.replaceWith(anchor)
              onChunkLoadError(sourceType, chunkUrl, resolver, undefined, () =>
                anchor.replaceWith(createLink())
              )
            }
            link.onload = () => {
              // CSS chunks do not register themselves, and as such must be marked as
              // loaded instantly.
              resolver.resolve()
            }
            return link
          }
          // Append to the `head` for webpack compatibility.
          document.head.appendChild(createLink())
        }
      } else if (isJs(chunkUrl)) {
        const previousScripts = findChunkScripts(chunkUrl)
        if (previousScripts.length > 0) {
          for (const script of previousScripts) {
            script.addEventListener(
              'error',
              () => {
                // Drop the failed tag so a retry can re-add it cleanly.
                script.remove()
                onChunkLoadError(sourceType, chunkUrl, resolver)
              },
              { once: true }
            )
          }
        } else {
          const script = document.createElement('script')
          script.crossOrigin = CROSS_ORIGIN
          script.src = chunkUrl
          // We'll only mark the chunk as loaded once the script has been executed,
          // which happens in `registerChunk`. Hence the absence of `resolve()` in
          // this branch.
          script.onerror = () => {
            // Drop the failed tag so a retry can re-add it cleanly.
            script.remove()
            onChunkLoadError(sourceType, chunkUrl, resolver)
          }
          // Append to the `head` for webpack compatibility.
          document.head.appendChild(script)
        }
      } else {
        throw new Error(`can't infer type of chunk from URL ${chunkUrl}`)
      }
    }

    resolver.loadingStarted = true
    return resolver.promise
  }
})()
