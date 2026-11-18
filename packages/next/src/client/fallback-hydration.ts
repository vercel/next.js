import type {
  InitialRSCPayload,
  NavigationFlightResponse,
} from '../shared/lib/app-router-types'
import type {
  FullTransportNode,
  PartialTransportNode,
} from '../shared/lib/rsc-transport'
import {
  doesStaticSegmentAppearInURL,
  getCacheKeyForDynamicParam,
  getRenderedPathname,
  getRenderedSearch,
  parseDynamicParamFromURLPart,
  urlToUrlWithoutFlightMarker,
} from './route-params'
import {
  createFromNextReadableStream,
  fetchServerResponse,
} from './components/router-reducer/fetch-server-response'
import { createHrefFromUrl } from './components/router-reducer/create-href-from-url'
import { splitPathnameIntoParts } from './components/segment-cache/cache-key'
import { getNavigationBuildId } from './navigation-build-id'
import { NEXT_NAV_DEPLOYMENT_ID_HEADER } from '../lib/constants'
import { RSC_CONTENT_TYPE_HEADER } from './components/app-router-headers'
import { PAGE_SEGMENT_KEY } from '../shared/lib/segment'
import { PrefetchHint } from '../shared/lib/app-router-types'
import { fillInFallbackTransportTree } from './flight-data-helpers'

export type FallbackHydration = {
  params: Array<[name: string, placeholder: string]>
  response: Promise<Response>
}

/**
 * This prepares a fully static fallback shell for hydration before the router
 * initializes. The shell needs no server resume, but its router tree still
 * holds placeholders for the fallback params. Partial prerenders with pending
 * server work resume on the server instead.
 *
 * The client resolves fallback params from the rendered pathname, which a
 * rewrite can change. The client cannot read the document response's headers.
 * The client resume script therefore requests `/_tree` for the document URL.
 * That response supplies the rendered pathname and route structure. The inline
 * Flight payload supplies the component output.
 *
 * The document and tree requests can resolve to incompatible routes, for
 * example when a proxy rewrite depends on a request header.
 *
 * - Compatible trees: the client hydrates the inline output.
 * - Incompatible or missing tree: the client fetches replacement data.
 * - Deployment mismatch, MPA URL or other origin: the client loads a document.
 * - Unusable replacement data: the client attempts a document reload.
 *
 * The HTML already contains the Flight data, so compatible hydration needs only
 * the small `/_tree` response. The replacement path adds a root RSC request.
 * The client renders usable replacement data without hydration.
 */
export async function resolveFallbackHydration(
  initialPayload: InitialRSCPayload,
  fallback: FallbackHydration
): Promise<{ payload: InitialRSCPayload; shouldHydrate: boolean }> {
  try {
    const response = await fallback.response
    const responseUrl = urlToUrlWithoutFlightMarker(new URL(response.url))
    if (responseUrl.origin !== location.origin) {
      response.body?.cancel().catch(() => {})
      return navigateToDocument(responseUrl.href)
    }
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get('content-type')?.startsWith(RSC_CONTENT_TYPE_HEADER)
    ) {
      throw new Error('The fallback route tree is unavailable.')
    }
    const treePayload =
      await createFromNextReadableStream<NavigationFlightResponse>(
        response.body,
        undefined,
        { allowPartialStream: true }
      )
    if (
      (response.headers.get(NEXT_NAV_DEPLOYMENT_ID_HEADER) ?? treePayload.b) !==
      getNavigationBuildId()
    ) {
      return navigateToDocument(location.href)
    }
    if (treePayload.n !== undefined) {
      return navigateToDocument(treePayload.n)
    }
    const pathnameParts = splitPathnameIntoParts(getRenderedPathname(response))
    const tree = treePayload.t
      ? resolveFallbackTree(
          initialPayload.t.t,
          treePayload.t.t,
          new Map(fallback.params),
          pathnameParts,
          0
        )
      : null
    if (tree !== null) {
      if (response.redirected) {
        if (!responseUrl.hash) {
          responseUrl.hash = location.hash
        }
        history.replaceState(history.state, '', responseUrl)
      }
      return {
        payload: {
          ...initialPayload,
          c: createHrefFromUrl(
            response.redirected ? responseUrl : location
          ).split('/'),
          q: getRenderedSearch(response),
          t: { t: tree, h: initialPayload.t.h },
        },
        shouldHydrate: true,
      }
    }
  } catch {
    // A missing tree makes the client request a complete replacement before it
    // initializes the router.
  }

  const documentUrl = new URL(location.href)
  const documentHash = documentUrl.hash
  documentUrl.hash = ''
  const result = await fetchServerResponse(documentUrl, {
    flightRouterState: ['', {}, null, 'refetch'],
    nextUrl: null,
  })
  if (typeof result === 'string') {
    return navigateToDocument(result)
  }
  if (result.canonicalUrl.origin !== location.origin) {
    return navigateToDocument(result.canonicalUrl.href)
  }
  const data = result.transportData
  if (!data || !data.h || !isFullTree(data.t)) {
    return navigateToDocument(location.href)
  }
  if (!result.canonicalUrl.hash) {
    result.canonicalUrl.hash = documentHash
  }
  history.replaceState(history.state, '', result.canonicalUrl)
  return {
    payload: {
      b: getNavigationBuildId(),
      c: createHrefFromUrl(result.canonicalUrl).split('/'),
      q: result.renderedSearch,
      i: result.couldBeIntercepted,
      t: {
        t: fillInFallbackTransportTree(
          data.t,
          splitPathnameIntoParts(result.renderedPathname),
          0
        ),
        h: data.h,
      },
      G: initialPayload.G,
      m: undefined,
      S: result.supportsPerSegmentPrefetching,
      r: result.flightResponse.r,
      s: result.flightResponse.s,
      d: result.flightResponse.d,
    },
    shouldHydrate: false,
  }
}

/**
 * This compares the inline tree with the `/_tree` response and the rendered
 * pathname. It returns a copy of the inline tree with fallback params resolved,
 * or null on a mismatch. Concrete params must match because they can affect
 * server-rendered output. Only placeholders in `fallbackParams` may change.
 */
function resolveFallbackTree(
  original: FullTransportNode,
  target: PartialTransportNode,
  fallbackParams: ReadonlyMap<string, string>,
  pathnameParts: string[],
  partIndex: number
): FullTransportNode | null {
  const originalSegment = original.s
  const targetSegment = target.s
  let segment = originalSegment
  let nextIndex = partIndex
  if (
    ((original.h ?? 0) & PrefetchHint.IsRootLayoutOrAbove) !==
    ((target.h ?? 0) & PrefetchHint.IsRootLayoutOrAbove)
  ) {
    return null
  }
  if (typeof originalSegment === 'string') {
    if (originalSegment !== targetSegment) {
      return null
    }
    if (doesStaticSegmentAppearInURL(originalSegment)) {
      if (partIndex >= pathnameParts.length) {
        return null
      }
      if (pathnameParts[partIndex] !== originalSegment) {
        try {
          if (
            decodeURIComponent(pathnameParts[partIndex]) !== originalSegment
          ) {
            return null
          }
        } catch {
          return null
        }
      }
      nextIndex++
    } else if (
      originalSegment === PAGE_SEGMENT_KEY &&
      partIndex !== pathnameParts.length
    ) {
      return null
    }
  } else {
    if (
      typeof targetSegment === 'string' ||
      originalSegment.n !== targetSegment.n ||
      originalSegment.t !== targetSegment.t
    ) {
      return null
    }
    const paramValue = parseDynamicParamFromURLPart(
      targetSegment.t,
      pathnameParts,
      partIndex
    )
    const key = getCacheKeyForDynamicParam(paramValue)
    if (
      (targetSegment.k !== null && targetSegment.k !== key) ||
      (fallbackParams.get(originalSegment.n) !== originalSegment.k &&
        originalSegment.k !== key)
    ) {
      return null
    }
    segment = { ...originalSegment, k: key }
    nextIndex =
      targetSegment.t === 'oc' || targetSegment.t.startsWith('c')
        ? pathnameParts.length
        : partIndex + 1
  }
  if ((original.c?.size ?? 0) !== (target.c?.size ?? 0)) {
    return null
  }
  const children = original.c ? new Map<string, FullTransportNode>() : undefined
  if (original.c && children) {
    for (const [slot, child] of original.c) {
      const targetChild = target.c?.get(slot)
      if (!targetChild) {
        return null
      }
      const resolved = resolveFallbackTree(
        child,
        targetChild,
        fallbackParams,
        pathnameParts,
        nextIndex
      )
      if (!resolved) {
        return null
      }
      children.set(slot, resolved)
    }
  }
  return { ...original, s: segment, c: children }
}

/**
 * This checks that every node has its `d` field, which `InitialRSCPayload`
 * requires. React content in a node can still be partial or suspended.
 */
function isFullTree(node: PartialTransportNode): node is FullTransportNode {
  if (node.d === undefined) {
    return false
  }
  if (node.c) {
    for (const child of node.c.values()) {
      if (!isFullTree(child)) {
        return false
      }
    }
  }
  return true
}

const DOCUMENT_RETRY_KEY = '__next_fallback_document_retry'

function getHistoryState(): Record<string, unknown> {
  const state: unknown = history.state
  return state !== null && typeof state === 'object' ? { ...state } : {}
}

/**
 * This removes the retry marker from the current history entry. The application
 * root calls this after each successful mount so a later bootstrap in that
 * entry can reload once more.
 */
export function clearFallbackDocumentRetry(): void {
  try {
    const state = getHistoryState()
    if (state[DOCUMENT_RETRY_KEY] === true) {
      delete state[DOCUMENT_RETRY_KEY]
      history.replaceState(state, '')
    }
  } catch {}
}

/**
 * This starts an HTTP(S) document navigation before router initialization. The
 * router's URL checks do not run on this path. This preserves the source
 * fragment only for a same-origin destination without its own fragment. The
 * history entry keeps the retry marker across a same-origin reload. A second
 * attempt in that entry rejects to prevent a reload loop. The promise remains
 * pending after navigation starts so bootstrap cannot continue.
 */
function navigateToDocument(url: string): Promise<never> {
  const destination = new URL(url, location.href)
  if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
    return Promise.reject(
      new Error('The fallback page returned an invalid document URL.')
    )
  }
  if (destination.origin !== location.origin) {
    location.replace(destination.href)
    return new Promise(() => {})
  }
  if (!destination.hash) {
    destination.hash = location.hash
  }
  try {
    const state = getHistoryState()
    if (state[DOCUMENT_RETRY_KEY] === true) {
      throw new Error('The fallback page could not initialize after reloading.')
    }
    history.replaceState(
      { ...state, [DOCUMENT_RETRY_KEY]: true },
      '',
      destination
    )
  } catch (error) {
    return Promise.reject(error)
  }
  location.reload()
  return new Promise(() => {})
}
