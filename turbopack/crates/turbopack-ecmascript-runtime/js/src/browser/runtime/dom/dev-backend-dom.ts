/**
 * This file contains the runtime code specific to the Turbopack development
 * ECMAScript DOM runtime.
 *
 * It will be appended to the base development runtime code.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../base/runtime-base.ts" />
/// <reference path="../base/dev-base.ts" />
/// <reference path="./runtime-backend-dom.ts" />
/// <reference path="../../../shared/require-type.d.ts" />

let DEV_BACKEND: DevRuntimeBackend
;(() => {
  DEV_BACKEND = {
    unloadChunk(chunkUrl) {
      deleteResolver(chunkUrl)

      // Strip query string so we match links regardless of cache-busting
      // params (e.g. ?ts=) that may differ between HMR updates.
      const baseChunkUrl = chunkUrl.split('?')[0]
      // TODO(PACK-2140): remove this once all filenames are guaranteed to be escaped.
      const decodedBaseChunkUrl = decodeURI(baseChunkUrl)

      if (isCss(chunkUrl)) {
        const links = document.querySelectorAll(
          `link[href="${baseChunkUrl}"],link[href^="${baseChunkUrl}?"],link[href="${decodedBaseChunkUrl}"],link[href^="${decodedBaseChunkUrl}?"]`
        )
        for (const link of Array.from(links)) {
          link.remove()
        }
      } else if (isJs(chunkUrl)) {
        // Unloading a JS chunk would have no effect, as it lives in the JS
        // runtime once evaluated.
        // However, we still want to remove the script tag from the DOM to keep
        // the HTML somewhat consistent from the user's perspective.
        const scripts = document.querySelectorAll(
          `script[src="${baseChunkUrl}"],script[src^="${baseChunkUrl}?"],script[src="${decodedBaseChunkUrl}"],script[src^="${decodedBaseChunkUrl}?"]`
        )
        for (const script of Array.from(scripts)) {
          script.remove()
        }
      } else {
        throw new Error(`can't infer type of chunk from URL ${chunkUrl}`)
      }
    },

    reloadChunk(chunkUrl) {
      return new Promise<void>((resolve, reject) => {
        if (!isCss(chunkUrl)) {
          reject(new Error('The DOM backend can only reload CSS chunks'))
          return
        }

        // Strip query string so we match links regardless of cache-busting
        // params (e.g. ?ts=) that may differ between HMR updates.
        const baseChunkUrl = chunkUrl.split('?')[0]
        const decodedBaseChunkUrl = decodeURI(baseChunkUrl)
        const previousLinks = document.querySelectorAll(
          `link[rel=stylesheet][href="${baseChunkUrl}"],link[rel=stylesheet][href^="${baseChunkUrl}?"],link[rel=stylesheet][href="${decodedBaseChunkUrl}"],link[rel=stylesheet][href^="${decodedBaseChunkUrl}?"]`
        )

        if (previousLinks.length === 0) {
          reject(new Error(`No link element found for chunk ${chunkUrl}`))
          return
        }

        const link = document.createElement('link')
        link.rel = 'stylesheet'

        if (
          navigator.userAgent.includes('Firefox') ||
          (navigator.userAgent.includes('Safari') &&
            !navigator.userAgent.includes('Chrome') &&
            !navigator.userAgent.includes('Chromium'))
        ) {
          // Firefox won't reload CSS files that were previously loaded on the
          // current page: https://bugzilla.mozilla.org/show_bug.cgi?id=1037506
          //
          // Safari serves cached CSS when a <link rel=preload> exists for the
          // same URL: https://bugs.webkit.org/show_bug.cgi?id=187726
          //
          // Replace or add a fresh `ts` cache-busting param without
          // discarding other query parameters that may already be present.
          const url = new URL(chunkUrl, location.origin)
          // Reduced timer precision in some browers could lead to an update getting dropped
          // in Firefox if it happens fast enough (in firefox precision is sometimes 100ms!).
          // So trust that the server is only updating us when it is important and use a
          // random number to bust the cache.
          url.searchParams.set('ts', `${Date.now()}.${Math.random()}`)
          link.href = url.pathname + url.search
        } else {
          link.href = chunkUrl
        }

        link.onerror = () => {
          reject()
        }
        link.onload = () => {
          // First load the new CSS, then remove the old ones. This prevents visible
          // flickering that would happen in-between removing the previous CSS and
          // loading the new one.
          for (const previousLink of Array.from(previousLinks))
            previousLink.remove()

          // CSS chunks do not register themselves, and as such must be marked as
          // loaded instantly.
          resolve()
        }

        // Make sure to insert the new CSS right after the previous one, so that
        // its precedence is higher.
        previousLinks[0].parentElement!.insertBefore(
          link,
          previousLinks[0].nextSibling
        )
      })
    },

    restart: () => self.location.reload(),
  }

  function deleteResolver(chunkUrl: ChunkUrl) {
    chunkResolvers.delete(chunkUrl)
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
