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
  const cssReloads = new Map<string, Promise<void>>()
  const cancelCssReloads = new Map<string, () => void>()
  const reconciledCss = new Set<string>()
  const cssGenerations = new Map<string, number>()

  function cssKey(chunkUrl: ChunkUrl) {
    return decodeURI(chunkUrl.split('?')[0])
  }

  function stylesheetLinks(chunkUrl: ChunkUrl) {
    // Match encoded/decoded URLs and retain query/base-path/asset-suffix behavior.
    const baseChunkUrl = chunkUrl.split('?')[0]
    const decodedBaseChunkUrl = decodeURI(baseChunkUrl)
    return document.querySelectorAll<HTMLLinkElement>(
      `link[rel=stylesheet][href="${baseChunkUrl}"],link[rel=stylesheet][href^="${baseChunkUrl}?"],link[rel=stylesheet][href="${decodedBaseChunkUrl}"],link[rel=stylesheet][href^="${decodedBaseChunkUrl}?"]`
    )
  }

  function reloadCss(chunkUrl: ChunkUrl, initial: boolean) {
    if (!isCss(chunkUrl)) {
      return Promise.reject(
        new Error('The DOM backend can only reload CSS chunks')
      )
    }
    const key = cssKey(chunkUrl)
    const generation = cssGenerations.get(key)
    if (initial) {
      // Shared CSS is reconciled at most once. Do not claim an inactive resource:
      // another chunk list may become ready after its stylesheet is mounted.
      if (reconciledCss.has(key) || stylesheetLinks(chunkUrl).length === 0) {
        return Promise.resolve()
      }
      reconciledCss.add(key)
    }

    // A newer edit must fetch after the older replacement finishes. Otherwise
    // both loads capture the same previous links, and the older response can win.
    const previous = cssReloads.get(key)
    const load = () =>
      new Promise<void>((resolve, reject) => {
        const previousLinks = Array.from(stylesheetLinks(chunkUrl))
        if (
          initial &&
          (previousLinks.length === 0 || cssGenerations.get(key) !== generation)
        ) {
          resolve()
          return
        }

        const original = previousLinks[0]
        const link = original
          ? (original.cloneNode(false) as HTMLLinkElement)
          : document.createElement('link')
        // The original is owned by the renderer. A temporary loading link must
        // not become another resource/precedence anchor during navigation.
        link.removeAttribute('id')
        link.removeAttribute('data-precedence')
        link.removeAttribute('data-href')
        link.rel = 'stylesheet'
        if (!original) link.crossOrigin = CROSS_ORIGIN

        // Adoption must change the original's URL: assigning an unchanged href
        // does not start another load or fire a load event in Chromium.
        // Firefox also won't reload previously loaded CSS (bug 1037506), and
        // Safari caches CSS when a matching preload exists (WebKit bug 187726).
        // Keep other query parameters while adding a fresh cache-busting ts.
        const url = new URL(chunkUrl, location.origin)
        // Reduced timer precision can drop fast edits; include randomness.
        url.searchParams.set('ts', `${Date.now()}.${Math.random()}`)
        // Preserve the raw base, including absolute/protocol-relative asset
        // prefixes, so adoption and later selectors still match the same URL.
        link.href = chunkUrl.split('?')[0] + url.search

        let removalObserver: MutationObserver | undefined
        const cleanup = () => {
          removalObserver?.disconnect()
          link.onload = link.onerror = null
          original?.removeEventListener('load', adopted)
          original?.removeEventListener('error', adoptionFailed)
          cancelCssReloads.delete(key)
        }
        const cancel = () => {
          cleanup()
          link.remove()
          resolve()
        }
        const adopted = () => {
          cleanup()
          link.remove()
          // Keep the renderer's original node, metadata and cascade position.
          for (const previousLink of previousLinks.slice(1))
            previousLink.remove()
          resolve()
        }
        const adoptionFailed = () => {
          cleanup()
          // The temporary sheet already loaded successfully. Keep it as a
          // fallback until a later HMR update can recover, unless unmounted.
          if (!original.isConnected) link.remove()
          reject(new Error(`Failed to adopt CSS chunk ${chunkUrl}`))
        }
        cancelCssReloads.set(key, cancel)
        link.onerror = () => {
          cleanup()
          link.remove()
          reject(new Error(`Failed to load CSS chunk ${chunkUrl}`))
        }
        link.onload = () => {
          link.onload = link.onerror = null
          if (!original?.isConnected) {
            cleanup()
            // Initial reconciliation must not revive a removed stylesheet.
            if (initial) link.remove()
            resolve()
            return
          }
          // Load before retargeting the original to avoid flicker. Adopting the
          // same URL can still fetch again (e.g. no-store); serialize subsequent
          // edits until the original finishes, not just the temporary link.
          // Detaching the original can abort its load without a load/error
          // event. Release the queue and don't leave initial CSS behind then.
          removalObserver = new MutationObserver(() => {
            if (!original.isConnected) {
              cleanup()
              if (initial) link.remove()
              resolve()
            }
          })
          removalObserver.observe(document, { childList: true, subtree: true })
          original.addEventListener('load', adopted)
          original.addEventListener('error', adoptionFailed)
          // Keep the raw relative attribute: later reload/unload selectors use
          // chunk URLs, whereas link.href expands them to an absolute URL.
          original.setAttribute('href', link.getAttribute('href')!)
        }

        if (previousLinks.length === 0) {
          // Ordinary HMR intentionally re-links an unmounted chunk whose chunk
          // list still receives a total update. Initial reconciliation skips it.
          document.head.appendChild(link)
        } else {
          previousLinks[0].parentElement!.insertBefore(
            link,
            previousLinks[0].nextSibling
          )
        }
      })
    // A failed load must not poison later updates. Callers report the failure.
    const promise = previous ? previous.catch(() => {}).then(load) : load()
    cssReloads.set(key, promise)
    const clear = () => {
      if (cssReloads.get(key) === promise) cssReloads.delete(key)
    }
    promise.then(clear, clear)
    return promise
  }

  DEV_BACKEND = {
    unloadChunk(chunkUrl) {
      deleteResolver(chunkUrl)

      // Strip query string so we match links regardless of cache-busting
      // params (e.g. ?ts=) that may differ between HMR updates.
      const baseChunkUrl = chunkUrl.split('?')[0]
      // TODO(PACK-2140): remove this once all filenames are guaranteed to be escaped.
      const decodedBaseChunkUrl = decodeURI(baseChunkUrl)

      if (isCss(chunkUrl)) {
        const key = cssKey(chunkUrl)
        cssGenerations.set(key, (cssGenerations.get(key) ?? 0) + 1)
        // Removed links need not fire load/error. Release queued work on unload.
        cancelCssReloads.get(key)?.()
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

    reloadChunk: (chunkUrl) => reloadCss(chunkUrl, false),
    reconcileChunk: (chunkUrl) => reloadCss(chunkUrl, true),
    restart: () => self.location.reload(),
  }

  function deleteResolver(chunkUrl: ChunkUrl) {
    chunkResolvers.delete(chunkUrl)
  }
})()

function _eval({ code, url, map }: EcmascriptModuleEntry): ModuleFactory {
  code += `\n\n//# sourceURL=${encodeURI(
    location.origin + RUNTIME_CHUNK_BASE_PATH + url + ASSET_SUFFIX
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
