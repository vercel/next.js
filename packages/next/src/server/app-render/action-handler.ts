import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'
import type { SizeLimit } from '../../types'
import type { RequestStore } from '../app-render/work-unit-async-storage.external'
import type { AppRenderContext, GenerateFlight } from './app-render'
import type { AppPageModule } from '../route-modules/app-page/module'
import type { BaseNextRequest, BaseNextResponse } from '../base-http'

import {
  RSC_HEADER,
  RSC_CONTENT_TYPE_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  ACTION_HEADER,
  NEXT_ACTION_NOT_FOUND_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_URL,
  NEXT_ACTION_REVALIDATED_HEADER,
} from '../../client/components/app-router-headers'
import {
  getAccessFallbackHTTPStatus,
  isHTTPAccessFallbackError,
} from '../../client/components/http-access-fallback/http-access-fallback'
import {
  getRedirectTypeFromError,
  getURLFromRedirectError,
} from '../../client/components/redirect'
import {
  isRedirectError,
  type RedirectType,
} from '../../client/components/redirect-error'
import RenderResult, {
  type AppPageRenderResultMetadata,
} from '../render-result'
import type { WorkStore } from '../app-render/work-async-storage.external'
import { actionAsyncStorage } from '../app-render/action-async-storage.external'
import { FlightRenderResult } from './flight-render-result'
import {
  filterReqHeaders,
  actionsForbiddenHeaders,
} from '../lib/server-ipc/utils'
import { getModifiedCookieValues } from '../web/spec-extension/adapters/request-cookies'

import {
  JSON_CONTENT_TYPE_HEADER,
  NEXT_CACHE_REVALIDATED_TAGS_HEADER,
  NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER,
} from '../../lib/constants'
import { getServerActionRequestMetadata } from '../lib/server-action-request-meta'
import { isCsrfOriginAllowed } from './csrf-protection'
import { warn } from '../../build/output/log'
import { RequestCookies, ResponseCookies } from '../web/spec-extension/cookies'
import { HeadersAdapter } from '../web/spec-extension/adapters/headers'
import { fromNodeOutgoingHttpHeaders } from '../web/utils'
import {
  selectWorkerForForwarding,
  type ServerModuleMap,
  getServerActionsManifest,
  getServerModuleMap,
  getActionNotFoundError,
  getInvalidServerReferenceIdError,
} from './manifests-singleton'
import { isNodeNextRequest, isWebNextRequest } from '../base-http/helpers'
import { normalizeFilePath } from './segment-explorer-path'
import {
  extractInfoFromServerReferenceId,
  mightBeServerReferenceId,
} from '../../shared/lib/server-reference-info'
import type { ServerActionLogInfo } from '../dev/server-action-logger'
import { RedirectStatusCode } from '../../client/components/redirect-status-code'
import { synchronizeMutableCookies } from '../async-storage/request-store'
import type { TemporaryReferenceSet } from 'react-server-dom-webpack/server'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import { executeRevalidates } from '../revalidation-utils'
import { addRequestMeta, getRequestMeta } from '../request-meta'
import { setCacheBustingSearchParamWithHash } from '../../client/components/router-reducer/set-cache-busting-search-param'
import {
  ActionDidNotRevalidate,
  ActionDidRevalidateStaticAndDynamic,
} from '../../shared/lib/action-revalidation-kind'
import { computeCacheBustingSearchParam } from '../../shared/lib/router/utils/cache-busting-search-param'

const INLINE_ACTION_PREFIX = '$$RSC_SERVER_ACTION_'

/**
 * Checks if the app has any server actions defined in any runtime.
 */
function hasServerActions() {
  const serverActionsManifest = getServerActionsManifest()

  return (
    Object.keys(serverActionsManifest.node).length > 0 ||
    Object.keys(serverActionsManifest.edge).length > 0
  )
}

function getUnrecognizedActionStatusCode(actionId: string | null): 400 | 409 {
  return actionId !== null && !mightBeServerReferenceId(actionId) ? 400 : 409
}

function getUnrecognizedActionResponseBody(statusCode: 400 | 409): string {
  return statusCode === 400
    ? 'Invalid Server Action request.'
    : 'Server Action unavailable.'
}

function nodeHeadersToRecord(
  headers: IncomingHttpHeaders | OutgoingHttpHeaders
) {
  const record: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      record[key] = Array.isArray(value) ? value.join(', ') : `${value}`
    }
  }
  return record
}

function getForwardedHeaders(
  req: BaseNextRequest,
  res: BaseNextResponse
): Headers {
  // Get request headers and cookies
  const requestHeaders = req.headers
  const requestCookies = new RequestCookies(HeadersAdapter.from(requestHeaders))

  // Get response headers and cookies
  const responseHeaders = res.getHeaders()
  const responseCookies = new ResponseCookies(
    fromNodeOutgoingHttpHeaders(responseHeaders)
  )

  // Merge request and response headers
  const mergedHeaders = filterReqHeaders(
    {
      ...nodeHeadersToRecord(requestHeaders),
      ...nodeHeadersToRecord(responseHeaders),
    },
    actionsForbiddenHeaders
  ) as Record<string, string>

  // Merge cookies into requestCookies, so responseCookies always take precedence
  // and overwrite/delete those from requestCookies.
  responseCookies.getAll().forEach((cookie) => {
    if (typeof cookie.value === 'undefined') {
      requestCookies.delete(cookie.name)
    } else {
      requestCookies.set(cookie)
    }
  })

  // Update the 'cookie' header with the merged cookies
  mergedHeaders['cookie'] = requestCookies.toString()

  // Remove headers that should not be forwarded
  delete mergedHeaders['transfer-encoding']

  return new Headers(mergedHeaders)
}

function addRevalidationHeader(
  res: BaseNextResponse,
  {
    workStore,
    requestStore,
  }: {
    workStore: WorkStore
    requestStore: RequestStore
  }
) {
  // If a tag was revalidated, the client router needs to invalidate all the
  // client router cache as they may be stale. And if a path was revalidated, the
  // client needs to invalidate all subtrees below that path.

  // TODO: Currently we don't send the specific tags or paths to the client,
  // we just send a flag indicating that all the static data on the client
  // should be invalidated. In the future, this will likely be a Bloom filter
  // or bitmask of some kind.

  // TODO-APP: Currently the prefetch cache doesn't have subtree information,
  // so we need to invalidate the entire cache if a path was revalidated.
  // TODO-APP: Currently paths are treated as tags, so the second element of the tuple
  // is always empty.

  // Only count tags without a profile (updateTag) as requiring client cache invalidation
  // Tags with a profile (revalidateTag) use stale-while-revalidate and shouldn't
  // trigger immediate client-side cache invalidation
  const isTagRevalidated = workStore.pendingRevalidatedTags?.some(
    (item) => item.profile === undefined
  )
    ? 1
    : 0
  const isCookieRevalidated = getModifiedCookieValues(
    requestStore.mutableCookies
  ).length
    ? 1
    : 0

  // First check if a tag, cookie, or path was revalidated.
  if (isTagRevalidated || isCookieRevalidated) {
    res.setHeader(
      NEXT_ACTION_REVALIDATED_HEADER,
      JSON.stringify(ActionDidRevalidateStaticAndDynamic)
    )
  } else if (
    // Check for refresh() actions. This will invalidate only the dynamic data.
    workStore.pathWasRevalidated !== undefined &&
    workStore.pathWasRevalidated !== ActionDidNotRevalidate
  ) {
    res.setHeader(
      NEXT_ACTION_REVALIDATED_HEADER,
      JSON.stringify(workStore.pathWasRevalidated)
    )
  }
}

/**
 * Forwards a server action request to a separate worker. Used when the requested action is not available in the current worker.
 */
async function createForwardedActionResponse(
  req: BaseNextRequest,
  res: BaseNextResponse,
  host: Host,
  workerPathname: string,
  basePath: string,
  actionId: string
) {
  if (!host) {
    throw new Error(
      'Invariant: Missing `host` header from a forwarded Server Actions request.'
    )
  }

  const forwardedHeaders = getForwardedHeaders(req, res)

  // indicate that this action request was forwarded from another worker
  // we use this to skip rendering the flight tree so that we don't update the UI
  // with the response from the forwarded worker
  forwardedHeaders.set('x-action-forwarded', '1')

  // TODO: Remove __NEXT_PRIVATE_ORIGIN
  let origin: string | undefined = process.env.__NEXT_PRIVATE_ORIGIN
  if (origin === undefined) {
    const initUrl = getRequestMeta(req, 'initURL')
    if (initUrl !== undefined) {
      try {
        const parsedUrl = new URL(initUrl)
        origin = parsedUrl.origin
      } catch (error) {
        throw new Error(
          'Could not determine origin for forwarded Server Actions request. This can happen if port or hostname are not configured for this server.',
          { cause: error }
        )
      }
    } else {
      throw new InvariantError('Missing initURL')
    }
  }

  const fetchUrl = new URL(`${origin}${basePath}${workerPathname}`)

  try {
    let body: BodyInit | ReadableStream<Uint8Array> | undefined
    if (
      // The type check here ensures that `req` is correctly typed, and the
      // environment variable check provides dead code elimination.
      process.env.NEXT_RUNTIME === 'edge' &&
      isWebNextRequest(req)
    ) {
      if (!req.body) {
        throw new Error('Invariant: missing request body.')
      }

      body = req.body
    } else if (
      // The type check here ensures that `req` is correctly typed, and the
      // environment variable check provides dead code elimination.
      process.env.NEXT_RUNTIME !== 'edge' &&
      isNodeNextRequest(req)
    ) {
      body = req.stream()
    } else {
      throw new Error('Invariant: Unknown request type.')
    }

    // Forward the request to the new worker
    const response = await fetch(fetchUrl, {
      method: 'POST',
      body,
      duplex: 'half',
      headers: forwardedHeaders,
      redirect: 'manual',
      next: {
        // @ts-ignore
        internal: 1,
      },
    })

    if (
      response.headers.get('content-type')?.startsWith(RSC_CONTENT_TYPE_HEADER)
    ) {
      // copy the headers from the redirect response to the response we're sending
      for (const [key, value] of response.headers) {
        if (!actionsForbiddenHeaders.includes(key)) {
          res.setHeader(key, value)
        }
      }

      return new FlightRenderResult(response.body!)
    }

    // Since we aren't consuming the response body, we cancel it to avoid memory leaks
    response.body?.cancel()

    // Pass the action-not-found marker through so the client throws
    // UnrecognizedActionError instead of a generic "unexpected response".
    if (response.headers.get(NEXT_ACTION_NOT_FOUND_HEADER) === '1') {
      res.setHeader(NEXT_ACTION_NOT_FOUND_HEADER, '1')
      res.setHeader('content-type', 'text/plain')
      // The marker denotes an unavailable action. Derive the status from the
      // requested ID so mixed-version workers cannot change its semantics.
      const statusCode = getUnrecognizedActionStatusCode(actionId)
      res.statusCode = statusCode
      return RenderResult.fromStatic(
        getUnrecognizedActionResponseBody(statusCode),
        'text/plain'
      )
    }
  } catch (err) {
    // we couldn't stream the forwarded response, so we'll just return an empty response
    console.error(`failed to forward action response`, err)
  }

  return RenderResult.fromStatic('{}', JSON_CONTENT_TYPE_HEADER)
}

/**
 * Returns the parsed redirect URL if we deem that it is hosted by us.
 *
 * We handle both relative and absolute redirect URLs.
 *
 * In case the redirect URL is not relative to the application we return `null`.
 */
function getAppRelativeRedirectUrl(
  basePath: string,
  host: Host,
  redirectUrl: string,
  currentPathname?: string
): URL | null {
  if (redirectUrl.startsWith('/')) {
    // Absolute path - just add basePath
    return new URL(`${basePath}${redirectUrl}`, 'http://n')
  } else if (redirectUrl.startsWith('.')) {
    // Relative path - resolve relative to current pathname
    let base = currentPathname || '/'
    // Ensure the base path ends with a slash so relative resolution works correctly
    // e.g., "./subpage" from "/subdir" should resolve to "/subdir/subpage"
    // not "/subpage"
    if (!base.endsWith('/')) {
      base = base + '/'
    }
    const resolved = new URL(redirectUrl, `http://n${base}`)
    // Include basePath in the final URL
    return new URL(
      `${basePath}${resolved.pathname}${resolved.search}${resolved.hash}`,
      'http://n'
    )
  }

  const parsedRedirectUrl = new URL(redirectUrl)

  if (host?.value !== parsedRedirectUrl.host) {
    return null
  }

  // At this point the hosts are the same, just confirm we
  // are routing to a path underneath the `basePath`
  return parsedRedirectUrl.pathname.startsWith(basePath)
    ? parsedRedirectUrl
    : null
}

async function createRedirectRenderResult(
  req: BaseNextRequest,
  res: BaseNextResponse,
  originalHost: Host,
  redirectUrl: string,
  redirectType: RedirectType,
  basePath: string,
  workStore: WorkStore,
  currentPathname?: string
) {
  res.setHeader('x-action-redirect', `${redirectUrl};${redirectType}`)

  // If we're redirecting to another route of this Next.js application, we'll
  // try to stream the response from the other worker path. When that works,
  // we can save an extra roundtrip and avoid a full page reload.
  // When the redirect URL starts with a `/` or is to the same host, under the
  // `basePath` we treat it as an app-relative redirect;
  const appRelativeRedirectUrl = getAppRelativeRedirectUrl(
    basePath,
    originalHost,
    redirectUrl,
    currentPathname
  )

  if (appRelativeRedirectUrl) {
    if (!originalHost) {
      throw new Error(
        'Invariant: Missing `host` header from a forwarded Server Actions request.'
      )
    }

    const forwardedHeaders = getForwardedHeaders(req, res)
    forwardedHeaders.set(RSC_HEADER, '1')

    // TODO: Remove __NEXT_PRIVATE_ORIGIN
    let origin: string | undefined = process.env.__NEXT_PRIVATE_ORIGIN
    if (origin === undefined) {
      const initUrl = getRequestMeta(req, 'initURL')
      if (initUrl !== undefined) {
        try {
          const parsedUrl = new URL(initUrl)

          origin = parsedUrl.origin
        } catch (error) {
          throw new Error(
            'Could not determine origin for forwarded Server Actions request. This can happen if port or hostname are not configured for this server.',
            { cause: error }
          )
        }
      } else {
        throw new InvariantError('Missing initURL')
      }
    }

    const fetchUrl = new URL(
      `${origin}${appRelativeRedirectUrl.pathname}${appRelativeRedirectUrl.search}`
    )

    if (workStore.pendingRevalidatedTags) {
      forwardedHeaders.set(
        NEXT_CACHE_REVALIDATED_TAGS_HEADER,
        workStore.pendingRevalidatedTags.map((item) => item.tag).join(',')
      )
      forwardedHeaders.set(
        NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER,
        workStore.incrementalCache?.previewProps.previewModeId || ''
      )
    }

    // Ensures that when the path was revalidated we don't return a partial response on redirects
    forwardedHeaders.delete(NEXT_ROUTER_STATE_TREE_HEADER)
    // When an action follows a redirect, it's no longer handling an action: it's just a normal RSC request
    // to the requested URL. We should remove the `next-action` header so that it's not treated as an action
    forwardedHeaders.delete(ACTION_HEADER)

    try {
      const cacheBustingSearchParam = await computeCacheBustingSearchParam(
        forwardedHeaders.get(NEXT_ROUTER_PREFETCH_HEADER)
          ? ('1' as const)
          : undefined,
        forwardedHeaders.get(NEXT_ROUTER_SEGMENT_PREFETCH_HEADER) ?? undefined,
        forwardedHeaders.get(NEXT_ROUTER_STATE_TREE_HEADER) ?? undefined,
        forwardedHeaders.get(NEXT_URL) ?? undefined
      )
      setCacheBustingSearchParamWithHash(fetchUrl, cacheBustingSearchParam)

      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: forwardedHeaders,
        next: {
          // @ts-ignore
          internal: 1,
        },
      })

      if (
        response.headers
          .get('content-type')
          ?.startsWith(RSC_CONTENT_TYPE_HEADER)
      ) {
        // copy the headers from the redirect response to the response we're sending
        for (const [key, value] of response.headers) {
          if (!actionsForbiddenHeaders.includes(key)) {
            res.setHeader(key, value)
          }
        }

        return new FlightRenderResult(response.body!)
      } else {
        // Since we aren't consuming the response body, we cancel it to avoid memory leaks
        response.body?.cancel()
      }
    } catch (err) {
      // we couldn't stream the redirect response, so we'll just do a normal redirect
      console.error(`failed to get redirect response`, err)
    }
  }

  return RenderResult.EMPTY
}

// Used to compare Host header and Origin header.
const enum HostType {
  XForwardedHost = 'x-forwarded-host',
  Host = 'host',
}
type Host =
  | {
      type: HostType.XForwardedHost
      value: string
    }
  | {
      type: HostType.Host
      value: string
    }
  | undefined

/**
 * Ensures the value of the header can't create long logs.
 */
function limitUntrustedHeaderValueForLogs(value: string) {
  return value.length > 100 ? value.slice(0, 100) + '...' : value
}

export function parseHostHeader(
  headers: IncomingHttpHeaders,
  originDomain?: string
) {
  const forwardedHostHeader = headers['x-forwarded-host']
  const forwardedHostHeaderValue =
    forwardedHostHeader && Array.isArray(forwardedHostHeader)
      ? forwardedHostHeader[0]
      : forwardedHostHeader?.split(',')?.[0]?.trim()
  const hostHeader = headers['host']

  if (originDomain) {
    return forwardedHostHeaderValue === originDomain
      ? {
          type: HostType.XForwardedHost,
          value: forwardedHostHeaderValue,
        }
      : hostHeader === originDomain
        ? {
            type: HostType.Host,
            value: hostHeader,
          }
        : undefined
  }

  return forwardedHostHeaderValue
    ? {
        type: HostType.XForwardedHost,
        value: forwardedHostHeaderValue,
      }
    : hostHeader
      ? {
          type: HostType.Host,
          value: hostHeader,
        }
      : undefined
}

type ServerActionsConfig = {
  bodySizeLimit?: SizeLimit
  allowedOrigins?: string[]
}

type HandleActionResult =
  | {
      /** An MPA action threw notFound(), and we need to render the appropriate HTML */
      type: 'not-found'
    }
  | {
      type: 'done'
      result: RenderResult | undefined
      formState?: any
    }
  /** The request turned out not to be a server action. */
  | null

function getRevalidationWaitUntil(
  workStore: WorkStore,
  skipPageRendering: boolean
): Promise<void> | undefined {
  if (!skipPageRendering) {
    // Page rendering executes pending revalidations before rendering. We only
    // need to attach them to waitUntil when no page render will take place.
    return undefined
  }

  const revalidatesPromise = executeRevalidates(workStore)
  return revalidatesPromise === false ? undefined : revalidatesPromise
}

export async function handleAction({
  req,
  res,
  ComponentMod,
  generateFlight,
  workStore,
  requestStore,
  serverActions,
  ctx,
  metadata,
}: {
  req: BaseNextRequest
  res: BaseNextResponse
  ComponentMod: AppPageModule
  generateFlight: GenerateFlight
  workStore: WorkStore
  requestStore: RequestStore
  serverActions?: ServerActionsConfig
  ctx: AppRenderContext
  metadata: AppPageRenderResultMetadata
}): Promise<HandleActionResult> {
  const contentType = req.headers['content-type']
  const { page } = ctx.renderOpts
  const serverModuleMap = getServerModuleMap()

  const {
    actionId,
    isMultipartAction,
    isFetchAction,
    isURLEncodedAction,
    isPossibleServerAction,
  } = getServerActionRequestMetadata(req)

  const handleUnrecognizedAction = (
    err: unknown,
    statusCode: 400 | 409
  ): HandleActionResult => {
    // If the deployment doesn't have skew protection, this is expected to occasionally happen,
    // so we use a warning instead of an error.
    console.warn(err)

    // Return an empty response with a header that the client router will interpret.
    // We don't need to waste time encoding a flight response, and using a blank body + header
    // means that unrecognized actions can also be handled at the infra level
    // (i.e. without needing to invoke a lambda)
    res.setHeader(NEXT_ACTION_NOT_FOUND_HEADER, '1')
    res.setHeader('content-type', 'text/plain')
    res.statusCode = statusCode
    return {
      type: 'done',
      result: RenderResult.fromStatic(
        getUnrecognizedActionResponseBody(statusCode),
        'text/plain'
      ),
    }
  }

  // If it can't be a Server Action, skip handling.
  // Note that this can be a false positive -- any multipart/urlencoded POST can get us here,
  // But won't know if it's an MPA action or not until we call `decodeAction` below.
  if (!isPossibleServerAction) {
    return null
  }

  // We don't currently support URL encoded actions, so we bail out early.
  // Depending on if it's a fetch action or an MPA, we return a different response.
  if (isURLEncodedAction) {
    if (isFetchAction) {
      return {
        type: 'not-found',
      }
    } else {
      // This is an MPA action, so we return null
      return null
    }
  }

  // If the app has no server actions at all, we can reject the request early.
  if (!hasServerActions()) {
    const error =
      actionId !== null && !mightBeServerReferenceId(actionId)
        ? getInvalidServerReferenceIdError(actionId)
        : getActionNotFoundError(actionId)
    return handleUnrecognizedAction(
      error,
      getUnrecognizedActionStatusCode(actionId)
    )
  }

  let temporaryReferences: TemporaryReferenceSet | undefined

  // When running actions the default is no-store, you can still `cache: 'force-cache'`
  workStore.fetchCache = 'default-no-store'

  const originHeader = req.headers['origin']
  const originHost =
    typeof originHeader === 'string'
      ? // 'null' is a valid origin e.g. from privacy-sensitive contexts like sandboxed iframes.
        // However, these contexts can still send along credentials like cookies,
        // so we need to check if they're allowed cross-origin requests.
        originHeader === 'null'
        ? 'null'
        : new URL(originHeader).host
      : undefined
  const host = parseHostHeader(req.headers)

  let warning: string | undefined = undefined

  function warnBadServerActionRequest() {
    if (warning) {
      warn(warning)
    }
  }
  // This is to prevent CSRF attacks. If `x-forwarded-host` is set, we need to
  // ensure that the request is coming from the same host.
  if (!originHost) {
    // This is a handcrafted request without an origin or a request from an unsafe browser.
    // We'll let this through but log a warning.
    // We can't guard against unsafe browsers and handcrafted requests can't contain
    // user credentials that haven't been shared willingly.
    warning = 'Missing `origin` header from a forwarded Server Actions request.'
  } else if (!host || originHost !== host.value) {
    // If the customer sets a list of allowed origins, we'll allow the request.
    // These are considered safe but might be different from forwarded host set
    // by the infra (i.e. reverse proxies).
    if (isCsrfOriginAllowed(originHost, serverActions?.allowedOrigins)) {
      // Ignore it
    } else {
      if (host) {
        // This seems to be an CSRF attack. We should not proceed the action.
        console.error(
          `\`${
            host.type
          }\` header with value \`${limitUntrustedHeaderValueForLogs(
            host.value
          )}\` does not match \`origin\` header with value \`${limitUntrustedHeaderValueForLogs(
            originHost
          )}\` from a forwarded Server Actions request. Aborting the action.`
        )
      } else {
        // This is an attack. We should not proceed the action.
        console.error(
          `\`x-forwarded-host\` or \`host\` headers are not provided. One of these is needed to compare the \`origin\` header from a forwarded Server Actions request. Aborting the action.`
        )
      }

      const error = new Error('Invalid Server Actions request.')

      if (isFetchAction) {
        res.statusCode = 500
        metadata.statusCode = 500

        const promise = Promise.reject(error)
        try {
          // we need to await the promise to trigger the rejection early
          // so that it's already handled by the time we call
          // the RSC runtime. Otherwise, it will throw an unhandled
          // promise rejection error in the renderer.
          await promise
        } catch {
          // swallow error, it's gonna be handled on the client
        }

        return {
          type: 'done',
          result: await generateFlight(req, ctx, requestStore, {
            actionResult: promise,
            // We didn't execute an action, so no revalidations could have
            // occurred. We can skip rendering the page.
            skipPageRendering: true,
            temporaryReferences,
          }),
        }
      }

      throw error
    }
  }

  // ensure we avoid caching server actions unexpectedly
  res.setHeader(
    'Cache-Control',
    'no-cache, no-store, max-age=0, must-revalidate'
  )

  const actionWasForwarded = Boolean(req.headers['x-action-forwarded'])
  // A fetch action targeting a fallback route has no concrete params with
  // which to resume the destination page.
  const isActionOnlyFallbackRequest =
    isFetchAction &&
    requestStore.fallbackParams != null &&
    typeof ctx.renderOpts.postponed === 'string'
  const shouldSkipPageRendering =
    actionWasForwarded || isActionOnlyFallbackRequest

  // Only attempt to forward if this request has not already been forwarded.
  // Otherwise middleware that rewrites the action POST can cause the receiving
  // worker to forward again, looping indefinitely.
  if (actionId && !actionWasForwarded) {
    const forwardedWorker = selectWorkerForForwarding(actionId, page)

    // If forwardedWorker is truthy, it means there isn't a worker for the
    // action in the current handler, so we forward the request to a worker that
    // has the action.
    if (forwardedWorker) {
      return {
        type: 'done',
        result: await createForwardedActionResponse(
          req,
          res,
          host,
          forwardedWorker,
          ctx.renderOpts.basePath,
          actionId
        ),
      }
    }
  }

  try {
    return await actionAsyncStorage.run(
      { isAction: true },
      async (): Promise<HandleActionResult> => {
        // We only use these for fetch actions -- MPA actions handle them inside `decodeAction`.
        let actionModId: string | number | undefined
        let boundActionArguments: unknown[] = []

        const defaultBodySizeLimit = '1 MB'
        const bodySizeLimit =
          serverActions?.bodySizeLimit ?? defaultBodySizeLimit
        const bodySizeLimitBytes =
          bodySizeLimit !== defaultBodySizeLimit
            ? (
                require('next/dist/compiled/bytes') as typeof import('next/dist/compiled/bytes')
              ).parse(bodySizeLimit)
            : 1024 * 1024 // 1 MB

        if (
          // The type check here ensures that `req` is correctly typed, and the
          // environment variable check provides dead code elimination.
          process.env.NEXT_RUNTIME === 'edge' &&
          isWebNextRequest(req)
        ) {
          if (!req.body) {
            throw new Error('invariant: Missing request body.')
          }

          // Use react-server-dom-webpack/server
          const {
            createTemporaryReferenceSet,
            decodeReply,
            decodeAction,
            decodeFormState,
          } = ComponentMod

          temporaryReferences = createTemporaryReferenceSet()

          if (isMultipartAction) {
            // TODO-APP: Add streaming support
            // Read the body stream with size tracking to enforce bodySizeLimitBytes.
            // We cannot call req.request.formData() directly as that would bypass
            // the body size limit entirely.
            const edgeChunks: Uint8Array[] = []
            let edgeBodySize = 0
            const edgeReader = req.body.getReader()
            while (true) {
              const { done, value } = await edgeReader.read()
              if (done) break
              edgeBodySize += value.byteLength
              if (edgeBodySize > bodySizeLimitBytes) {
                const { ApiError } =
                  require('../api-utils') as typeof import('../api-utils')
                throw new ApiError(
                  413,
                  `Body exceeded ${bodySizeLimit} limit.\n` +
                    `To configure the body size limit for Server Actions, see: https://nextjs.org/docs/app/api-reference/next-config-js/serverActions#bodysizelimit`
                )
              }
              edgeChunks.push(value)
            }
            // Reconstruct a Blob from the buffered chunks and parse formData from it.
            // Note: we must pass the original Content-Type as an explicit header
            // rather than relying on the Blob's `type`. The Blob constructor
            // normalizes `type` to ASCII lowercase per the File API spec, which
            // would lowercase the multipart boundary parameter (e.g.
            // `boundary=----WebKitFormBoundaryAbCdEf`). The body bytes contain the
            // original mixed-case boundary delimiter, so a lowercased boundary
            // would fail to match and `formData()` would throw. An explicit header
            // on the Request takes precedence over the Blob's normalized type.
            const edgeBodyBlob = new Blob(edgeChunks as BlobPart[])
            const formData = await new Request('http://n/', {
              method: 'POST',
              headers: { 'content-type': req.headers['content-type'] ?? '' },
              body: edgeBodyBlob,
            }).formData()
            if (isFetchAction) {
              // A fetch action with a multipart body.

              try {
                actionModId = getActionModIdOrError(actionId, serverModuleMap)
              } catch (err) {
                return handleUnrecognizedAction(
                  err,
                  getUnrecognizedActionStatusCode(actionId)
                )
              }

              boundActionArguments = await decodeReply<unknown[]>(
                formData,
                serverModuleMap,
                { temporaryReferences }
              )
            } else {
              // Multipart POST, but not a fetch action.
              // Potentially an MPA action, we have to try decoding it to check.
              try {
                if (!areAllActionIdsValid(formData, serverModuleMap)) {
                  return handleUnrecognizedAction(
                    new Error('Invalid Server Actions request.'),
                    400
                  )
                }
              } catch (err) {
                return handleUnrecognizedAction(err, 409)
              }

              const action = await decodeAction(formData, serverModuleMap)
              if (typeof action === 'function') {
                // an MPA action.

                // Only warn if it's a server action, otherwise skip for other post requests
                warnBadServerActionRequest()

                const { actionResult } = await executeActionAndPrepareForRender(
                  action as () => Promise<unknown>,
                  [],
                  workStore,
                  requestStore,
                  actionWasForwarded
                )

                const formState = await decodeFormState(
                  actionResult,
                  formData,
                  serverModuleMap
                )

                // Skip the fetch path.
                // We need to render a full HTML version of the page for the response, we'll handle that in app-render.
                return {
                  type: 'done',
                  result: undefined,
                  formState,
                }
              } else {
                // We couldn't decode an action, so this POST request turned out not to be a server action request.
                return null
              }
            }
          } else {
            // POST with non-multipart body.

            // If it's not multipart AND not a fetch action,
            // then it can't be an action request.
            if (!isFetchAction) {
              return null
            }

            try {
              actionModId = getActionModIdOrError(actionId, serverModuleMap)
            } catch (err) {
              return handleUnrecognizedAction(
                err,
                getUnrecognizedActionStatusCode(actionId)
              )
            }

            // A fetch action with a non-multipart body.
            // In practice, this happens if `encodeReply` returned a string instead of FormData,
            // which can happen for very simple JSON-like values that don't need multiple flight rows.

            const chunks: Buffer[] = []
            let nonMultipartBodySize = 0
            const reader = req.body.getReader()
            while (true) {
              const { done, value } = await reader.read()
              if (done) {
                break
              }

              nonMultipartBodySize += value.byteLength
              if (nonMultipartBodySize > bodySizeLimitBytes) {
                const { ApiError } =
                  require('../api-utils') as typeof import('../api-utils')
                throw new ApiError(
                  413,
                  `Body exceeded ${bodySizeLimit} limit.\n` +
                    `To configure the body size limit for Server Actions, see: https://nextjs.org/docs/app/api-reference/next-config-js/serverActions#bodysizelimit`
                )
              }
              chunks.push(value)
            }

            const actionData = Buffer.concat(chunks).toString('utf-8')

            boundActionArguments = await decodeReply<unknown[]>(
              actionData,
              serverModuleMap,
              { temporaryReferences }
            )
          }
        } else if (
          // The type check here ensures that `req` is correctly typed, and the
          // environment variable check provides dead code elimination.
          process.env.NEXT_RUNTIME !== 'edge' &&
          isNodeNextRequest(req)
        ) {
          // Use react-server-dom-webpack/server.node which supports streaming
          const {
            createTemporaryReferenceSet,
            decodeReply,
            decodeReplyFromBusboy,
            decodeAction,
            decodeFormState,
          } = require(
            `./react-server.node`
          ) as typeof import('./react-server.node')

          temporaryReferences = createTemporaryReferenceSet()

          const { PassThrough, Readable, Transform } =
            require('node:stream') as typeof import('node:stream')
          const { pipeline } =
            require('node:stream/promises') as typeof import('node:stream/promises')

          // If actionBody was stashed in request meta (from parsing the postponed
          // state prefix in minimal mode), use it instead of req.body
          const actionBodyFromMeta = getRequestMeta(req, 'actionBody')
          const body: import('node:stream').Readable = actionBodyFromMeta
            ? Readable.from(actionBodyFromMeta)
            : req.body

          let size = 0
          const sizeLimitTransform = new Transform({
            transform(chunk, encoding, callback) {
              size += Buffer.byteLength(chunk, encoding)
              if (size > bodySizeLimitBytes) {
                const { ApiError } =
                  require('../api-utils') as typeof import('../api-utils')

                callback(
                  new ApiError(
                    413,
                    `Body exceeded ${bodySizeLimit} limit.\n` +
                      `To configure the body size limit for Server Actions, see: https://nextjs.org/docs/app/api-reference/next-config-js/serverActions#bodysizelimit`
                  )
                )
                return
              }

              callback(null, chunk)
            },
          })

          if (isMultipartAction) {
            if (isFetchAction) {
              // A fetch action with a multipart body.

              try {
                actionModId = getActionModIdOrError(actionId, serverModuleMap)
              } catch (err) {
                return handleUnrecognizedAction(
                  err,
                  getUnrecognizedActionStatusCode(actionId)
                )
              }

              const busboy = (
                require('next/dist/compiled/busboy') as typeof import('next/dist/compiled/busboy')
              )({
                defParamCharset: 'utf8',
                headers: req.headers,
                limits: { fieldSize: bodySizeLimitBytes },
              })

              const abortController = new AbortController()
              try {
                ;[, boundActionArguments] = await Promise.all([
                  pipeline(body, sizeLimitTransform, busboy, {
                    signal: abortController.signal,
                  }),
                  decodeReplyFromBusboy<unknown[]>(busboy, serverModuleMap, {
                    temporaryReferences,
                  }),
                ])
              } catch (err) {
                abortController.abort()
                throw err
              }
            } else {
              // Multipart POST, but not a fetch action.
              // Potentially an MPA action, we have to try decoding it to check.

              const sizeLimitedBody = new PassThrough()

              // React doesn't yet publish a busboy version of decodeAction
              // so we polyfill the parsing of FormData.
              const fakeRequest = new Request('http://localhost', {
                method: 'POST',
                // @ts-expect-error
                headers: { 'Content-Type': contentType },
                body: Readable.toWeb(
                  sizeLimitedBody
                ) as ReadableStream<Uint8Array>,
                duplex: 'half',
              })

              let formData: FormData
              const abortController = new AbortController()
              try {
                ;[, formData] = await Promise.all([
                  pipeline(body, sizeLimitTransform, sizeLimitedBody, {
                    signal: abortController.signal,
                  }),
                  fakeRequest.formData(),
                ])
              } catch (err) {
                abortController.abort()
                throw err
              }

              try {
                if (!areAllActionIdsValid(formData, serverModuleMap)) {
                  return handleUnrecognizedAction(
                    new Error('Invalid Server Actions request.'),
                    400
                  )
                }
              } catch (err) {
                return handleUnrecognizedAction(err, 409)
              }

              // TODO: Refactor so it is harder to accidentally decode an action before you have validated that the
              // action referred to is available.
              const action = await decodeAction(formData, serverModuleMap)
              if (typeof action === 'function') {
                // an MPA action.

                // Only warn if it's a server action, otherwise skip for other post requests
                warnBadServerActionRequest()

                const { actionResult } = await executeActionAndPrepareForRender(
                  action as () => Promise<unknown>,
                  [],
                  workStore,
                  requestStore,
                  actionWasForwarded
                )

                const formState = await decodeFormState(
                  actionResult,
                  formData,
                  serverModuleMap
                )

                // Skip the fetch path.
                // We need to render a full HTML version of the page for the response, we'll handle that in app-render.
                return {
                  type: 'done',
                  result: undefined,
                  formState,
                }
              } else {
                // We couldn't decode an action, so this POST request turned out not to be a server action request.
                return null
              }
            }
          } else {
            // POST with non-multipart body.

            // If it's not multipart AND not a fetch action,
            // then it can't be an action request.
            if (!isFetchAction) {
              return null
            }

            try {
              actionModId = getActionModIdOrError(actionId, serverModuleMap)
            } catch (err) {
              return handleUnrecognizedAction(
                err,
                getUnrecognizedActionStatusCode(actionId)
              )
            }

            // A fetch action with a non-multipart body.
            // In practice, this happens if `encodeReply` returned a string instead of FormData,
            // which can happen for very simple JSON-like values that don't need multiple flight rows.

            const sizeLimitedBody = new PassThrough()

            const chunks: Buffer[] = []
            await Promise.all([
              pipeline(body, sizeLimitTransform, sizeLimitedBody),
              (async () => {
                for await (const chunk of sizeLimitedBody) {
                  chunks.push(Buffer.from(chunk))
                }
              })(),
            ])

            const actionData = Buffer.concat(chunks).toString('utf-8')

            boundActionArguments = await decodeReply<unknown[]>(
              actionData,
              serverModuleMap,
              { temporaryReferences }
            )
          }
        } else {
          throw new Error('Invariant: Unknown request type.')
        }

        // actions.js
        // app/page.js
        //   action worker1
        //     appRender1

        // app/foo/page.js
        //   action worker2
        //     appRender

        // / -> fire action -> POST / -> appRender1 -> modId for the action file
        // /foo -> fire action -> POST /foo -> appRender2 -> modId for the action file

        const actionMod = (await ComponentMod.__next_app__.require(
          actionModId
        )) as Record<string, (...args: unknown[]) => Promise<unknown>>
        const actionHandler =
          actionMod[
            // `actionId` must exist if we got here, as otherwise we would have thrown an error above
            actionId!
          ]

        // Log server action call in development when enabled
        let logInfo: ServerActionLogInfo | null = null
        const { type: actionType } = extractInfoFromServerReferenceId(actionId!)
        if (
          process.env.NODE_ENV === 'development' &&
          ctx.renderOpts.logServerFunctions &&
          // TODO: For now, skip logging for 'use cache' Server Functions as the
          // output needs more work, or a different approach entirely.
          actionType !== 'use-cache'
        ) {
          const serverActionsManifest = getServerActionsManifest()
          const runtime = process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
          const actionInfo = serverActionsManifest[runtime]?.[actionId!]

          if (actionInfo) {
            const isInlineAction =
              actionInfo.exportedName?.startsWith(INLINE_ACTION_PREFIX)

            const projectDir =
              ctx.renderOpts.dir ||
              (process.env.NEXT_RUNTIME === 'edge' ? '' : process.cwd())
            const location = normalizeFilePath(projectDir, actionInfo.filename)

            // Format function name for display
            let functionName: string
            if (isInlineAction) {
              functionName = '<inline action>'
            } else if (actionInfo.exportedName === 'default') {
              functionName = 'default'
            } else {
              functionName = actionInfo.exportedName || '<action>'
            }

            logInfo = { functionName, args: boundActionArguments, location }
          }
        }

        const startTime = performance.now()
        const { actionResult, skipPageRendering } =
          await executeActionAndPrepareForRender(
            actionHandler,
            boundActionArguments,
            workStore,
            requestStore,
            shouldSkipPageRendering
          ).finally(() => {
            addRevalidationHeader(res, { workStore, requestStore })
            if (logInfo) {
              // Store server action log info to be logged after the request log
              const duration = Math.round(performance.now() - startTime)
              addRequestMeta(req, 'devServerActionLog', {
                functionName: logInfo.functionName,
                args: logInfo.args,
                location: logInfo.location,
                duration,
              })
            }
          })

        // For form actions, we need to continue rendering the page.
        if (isFetchAction) {
          return {
            type: 'done',
            result: await actionAsyncStorage.exit(() =>
              generateFlight(req, ctx, requestStore, {
                actionResult: Promise.resolve(actionResult),
                skipPageRendering,
                temporaryReferences,
                waitUntil: getRevalidationWaitUntil(
                  workStore,
                  skipPageRendering
                ),
              })
            ),
          }
        } else {
          // TODO: this shouldn't be reachable, because all non-fetch codepaths return early.
          // this will be handled in a follow-up refactor PR.
          return null
        }
      }
    )
  } catch (err) {
    if (isRedirectError(err)) {
      const redirectUrl = getURLFromRedirectError(err)
      const redirectType = getRedirectTypeFromError(err)

      if (isFetchAction) {
        // Fetch actions communicate redirects through `x-action-redirect` and
        // can include the redirect target's Flight response in the body. Since
        // this is not an HTTP redirect, keep the response successful.
        res.statusCode = 200
        metadata.statusCode = 200

        return {
          type: 'done',
          result: await createRedirectRenderResult(
            req,
            res,
            host,
            redirectUrl,
            redirectType,
            ctx.renderOpts.basePath,
            workStore,
            requestStore.url.pathname
          ),
        }
      }

      // For an MPA action, the redirect doesn't need a body, just a Location header.
      res.statusCode = RedirectStatusCode.SeeOther
      metadata.statusCode = RedirectStatusCode.SeeOther
      res.setHeader('Location', redirectUrl)
      return {
        type: 'done',
        result: RenderResult.EMPTY,
      }
    } else if (isHTTPAccessFallbackError(err)) {
      res.statusCode = getAccessFallbackHTTPStatus(err)
      metadata.statusCode = res.statusCode

      if (isFetchAction) {
        const promise = Promise.reject(err)
        try {
          // we need to await the promise to trigger the rejection early
          // so that it's already handled by the time we call
          // the RSC runtime. Otherwise, it will throw an unhandled
          // promise rejection error in the renderer.
          await promise
        } catch {
          // swallow error, it's gonna be handled on the client
        }
        return {
          type: 'done',
          result: await generateFlight(req, ctx, requestStore, {
            skipPageRendering: shouldSkipPageRendering,
            actionResult: promise,
            temporaryReferences,
            waitUntil: getRevalidationWaitUntil(
              workStore,
              shouldSkipPageRendering
            ),
          }),
        }
      }

      // For an MPA action, we need to render a HTML response. We'll handle that in app-render.
      return {
        type: 'not-found',
      }
    }

    // An error that didn't come from `redirect()` or `notFound()`, likely thrown from user code
    // (but it could also be a bug in our code!)

    if (isFetchAction) {
      // TODO: consider checking if the error is an `ApiError` and change status code
      // so that we can respond with a 413 to requests that break the body size limit
      // (but if we do that, we also need to make sure that whatever handles the non-fetch error path below does the same)
      res.statusCode = 500
      metadata.statusCode = 500
      const promise = Promise.reject(err)
      try {
        // we need to await the promise to trigger the rejection early
        // so that it's already handled by the time we call
        // the RSC runtime. Otherwise, it will throw an unhandled
        // promise rejection error in the renderer.
        await promise
      } catch {
        // swallow error, it's gonna be handled on the client
      }

      const skipPageRendering =
        workStore.pathWasRevalidated === undefined ||
        workStore.pathWasRevalidated === ActionDidNotRevalidate ||
        shouldSkipPageRendering

      return {
        type: 'done',
        result: await generateFlight(req, ctx, requestStore, {
          actionResult: promise,
          // If the page was not revalidated, or if this is an action-only
          // request, we can skip rendering the page.
          skipPageRendering,
          temporaryReferences,
          waitUntil: getRevalidationWaitUntil(workStore, skipPageRendering),
        }),
      }
    }

    // For an MPA action, we need to render a HTML response. We'll rethrow the error and let it be handled above.
    throw err
  }
}

/**
 * Limit on the number of arguments passed to a server action. This prevents
 * stack overflow during `action.apply()` from malicious requests.
 */
const SERVER_ACTION_ARGS_LIMIT = 1000

async function executeActionAndPrepareForRender<
  TFn extends (...args: any[]) => Promise<any>,
>(
  action: TFn,
  args: Parameters<TFn>,
  workStore: WorkStore,
  requestStore: RequestStore,
  shouldSkipPageRendering: boolean
): Promise<{
  actionResult: Awaited<ReturnType<TFn>>
  skipPageRendering: boolean
}> {
  requestStore.phase = 'action'
  let skipPageRendering = shouldSkipPageRendering

  if (args.length > SERVER_ACTION_ARGS_LIMIT) {
    throw new Error(
      `Server Action arguments list is too long (${args.length}). Maximum allowed is ${SERVER_ACTION_ARGS_LIMIT}.`
    )
  }

  try {
    const actionResult = await workUnitAsyncStorage.run(requestStore, () =>
      action.apply(null, args)
    )

    // If the page was not revalidated, or if this is an action-only request,
    // we can skip rendering the page.
    skipPageRendering ||=
      workStore.pathWasRevalidated === undefined ||
      workStore.pathWasRevalidated === ActionDidNotRevalidate

    return { actionResult, skipPageRendering }
  } finally {
    if (!skipPageRendering) {
      requestStore.phase = 'render'

      // When we switch to the render phase, cookies() will return
      // `workUnitStore.cookies` instead of
      // `workUnitStore.userspaceMutableCookies`. We want the render to see any
      // cookie writes that we performed during the action, so we need to update
      // the immutable cookies to reflect the changes.
      synchronizeMutableCookies(requestStore)

      // The server action might have toggled draft mode, so we need to reflect
      // that in the work store to be up-to-date for subsequent rendering.
      workStore.isDraftMode = requestStore.draftMode.isEnabled

      // If the action called revalidateTag/revalidatePath, then that might
      // affect data used by the subsequent render, so we need to make sure all
      // revalidations are applied before that.
      await executeRevalidates(workStore)
    }
  }
}

/**
 * Attempts to find the module ID for the action from the module map. When this fails, it could be a deployment skew where
 * the action came from a different deployment. It could also simply be an invalid POST request that is not a server action.
 * In either case, we'll throw an error to be handled by the caller.
 */
function getActionModIdOrError(
  actionId: string | null,
  serverModuleMap: ServerModuleMap
): string | number {
  // if we're missing the action ID header, we can't do any further processing
  if (!actionId) {
    throw new InvariantError("Missing 'next-action' header.")
  }

  const entry = serverModuleMap[actionId]

  if (entry == null) {
    // The proxy throws for malformed IDs and IDs that are missing from the
    // manifest. It only returns undefined when the ID collides with a
    // well-known property name (e.g. `toString`) that the proxy excludes from
    // server reference validation so that framework reflection probes don't
    // throw. Next.js never produces such an ID, so this is almost certainly a
    // probe with a known-bad ID. Repeat the manifest's throw logic here so the
    // caller gets a diagnosable error instead of a `TypeError`.
    throw mightBeServerReferenceId(actionId)
      ? getActionNotFoundError(actionId)
      : getInvalidServerReferenceIdError(actionId)
  }

  return entry.id
}

const $ACTION_ = '$ACTION_'
const $ACTION_REF_ = '$ACTION_REF_'
const $ACTION_ID_ = '$ACTION_ID_'

/**
 * This function mirrors logic inside React's decodeAction and should be kept in sync with that.
 * It pre-parses the FormData to ensure that any action IDs referred to are actual action IDs for
 * this Next.js application.
 */
function areAllActionIdsValid(
  mpaFormData: FormData,
  serverModuleMap: ServerModuleMap
): boolean {
  let seenActionRefs = 0
  let hasAtLeastOneAction = false
  // Before we attempt to decode the payload for a possible MPA action, assert
  // that all action IDs are valid IDs.
  for (let key of mpaFormData.keys()) {
    if (!key.startsWith($ACTION_)) {
      // not a relevant field
      continue
    }

    if (key.startsWith($ACTION_ID_)) {
      // No Bound args case
      if (isInvalidActionIdFieldName(key, serverModuleMap)) {
        return false
      }

      hasAtLeastOneAction = true
    } else if (key.startsWith($ACTION_REF_)) {
      if (++seenActionRefs > 2) {
        // We only expect to see at most 2 $ACTION_REF_ fields in the form data:
        // one from <form action="..." method="post">
        // and one from <input action="..." type="submit">
        return false
      }

      // Bound args case
      const actionDescriptorField =
        $ACTION_ + key.slice($ACTION_REF_.length) + ':0'
      const actionFields = mpaFormData.getAll(actionDescriptorField)
      if (actionFields.length !== 1) {
        return false
      }
      const actionField = actionFields[0]
      if (typeof actionField !== 'string') {
        return false
      }

      if (isInvalidStringActionDescriptor(actionField, serverModuleMap)) {
        return false
      }
      hasAtLeastOneAction = true
    }
  }
  return hasAtLeastOneAction
}

const ACTION_DESCRIPTOR_ID_PREFIX = '{"id":"'
function isInvalidStringActionDescriptor(
  actionDescriptor: string,
  serverModuleMap: ServerModuleMap
): boolean {
  if (actionDescriptor.startsWith(ACTION_DESCRIPTOR_ID_PREFIX) === false) {
    return true
  }

  const from = ACTION_DESCRIPTOR_ID_PREFIX.length
  const to = actionDescriptor.indexOf('"', from)
  if (to === -1) {
    return true
  }

  // We expect actionDescriptor to be '{"id":"<actionId>",...}'
  const actionId = actionDescriptor.slice(from, to)
  if (!mightBeServerReferenceId(actionId)) {
    return true
  }

  const entry = serverModuleMap[actionId]

  if (entry == null) {
    return true
  }

  return false
}

function isInvalidActionIdFieldName(
  actionIdFieldName: string,
  serverModuleMap: ServerModuleMap
): boolean {
  // The field name must always start with $ACTION_ID_ but since it is
  // the id is extracted from the key of the field we have already validated
  // this before entering this function
  const actionId = actionIdFieldName.slice($ACTION_ID_.length)
  if (!mightBeServerReferenceId(actionId)) {
    // this field name has too few or too many characters
    // or it is otherwise in the wrong format
    return true
  }

  const entry = serverModuleMap[actionId]

  if (entry == null) {
    return true
  }

  return false
}
