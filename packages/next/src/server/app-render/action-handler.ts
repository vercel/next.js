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
import RenderResult from '../render-result'
import type { WorkStore } from '../app-render/work-async-storage.external'
import { FlightRenderResult } from './flight-render-result'
import {
  filterReqHeaders,
  actionsForbiddenHeaders,
} from '../lib/server-ipc/utils'
import {
  appendMutableCookies,
  getModifiedCookieValues,
} from '../web/spec-extension/adapters/request-cookies'

import {
  NEXT_CACHE_REVALIDATED_TAGS_HEADER,
  NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER,
} from '../../lib/constants'
import {
  getServerActionRequestMetadataNew,
  transformActionMetadata,
  type ServerActionMetadata,
} from '../lib/server-action-request-meta'
import { isCsrfOriginAllowed } from './csrf-protection'
import { warn } from '../../build/output/log'
import { RequestCookies, ResponseCookies } from '../web/spec-extension/cookies'
import { HeadersAdapter } from '../web/spec-extension/adapters/headers'
import { fromNodeOutgoingHttpHeaders } from '../web/utils'
import { selectWorkerForForwarding } from './action-utils'
import { isNodeNextRequest, isWebNextRequest } from '../base-http/helpers'
import { RedirectStatusCode } from '../../client/components/redirect-status-code'
import { synchronizeMutableCookies } from '../async-storage/request-store'
import type { TemporaryReferenceSet } from 'react-server-dom-webpack/server.edge'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import type { NodeNextRequest } from '../base-http/node'
import type { Transform } from 'stream'
import { InvariantError } from '../../shared/lib/invariant-error'
import type { WebNextRequest } from '../base-http/web'

function formDataFromSearchQueryString(query: string) {
  const searchParams = new URLSearchParams(query)
  const formData = new FormData()
  for (const [key, value] of searchParams) {
    formData.append(key, value)
  }
  return formData
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

async function addRevalidationHeader(
  res: BaseNextResponse,
  {
    workStore,
    requestStore,
  }: {
    workStore: WorkStore
    requestStore: RequestStore
  }
) {
  await Promise.all([
    workStore.incrementalCache?.revalidateTag(workStore.revalidatedTags || []),
    ...Object.values(workStore.pendingRevalidates || {}),
    ...(workStore.pendingRevalidateWrites || []),
  ])

  // If a tag was revalidated, the client router needs to invalidate all the
  // client router cache as they may be stale. And if a path was revalidated, the
  // client needs to invalidate all subtrees below that path.

  // To keep the header size small, we use a tuple of
  // [[revalidatedPaths], isTagRevalidated ? 1 : 0, isCookieRevalidated ? 1 : 0]
  // instead of a JSON object.

  // TODO-APP: Currently the prefetch cache doesn't have subtree information,
  // so we need to invalidate the entire cache if a path was revalidated.
  // TODO-APP: Currently paths are treated as tags, so the second element of the tuple
  // is always empty.

  const isTagRevalidated = workStore.revalidatedTags?.length ? 1 : 0
  const isCookieRevalidated = getModifiedCookieValues(
    requestStore.mutableCookies
  ).length
    ? 1
    : 0

  res.setHeader(
    'x-action-revalidated',
    JSON.stringify([[], isTagRevalidated, isCookieRevalidated])
  )
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
  workStore: WorkStore
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

  const proto = workStore.incrementalCache?.requestProtocol || 'https'

  // For standalone or the serverful mode, use the internal origin directly
  // other than the host headers from the request.
  const origin = process.env.__NEXT_PRIVATE_ORIGIN || `${proto}://${host.value}`

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
    } else {
      // Since we aren't consuming the response body, we cancel it to avoid memory leaks
      response.body?.cancel()
    }
  } catch (err) {
    // we couldn't stream the forwarded response, so we'll just return an empty response
    console.error(`failed to forward action response`, err)
  }

  return RenderResult.fromStatic('{}')
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
  redirectUrl: string
): URL | null {
  if (redirectUrl.startsWith('/') || redirectUrl.startsWith('.')) {
    // Make sure we are appending the basePath to relative URLS
    return new URL(`${basePath}${redirectUrl}`, 'http://n')
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
  workStore: WorkStore
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
    redirectUrl
  )

  if (appRelativeRedirectUrl) {
    if (!originalHost) {
      throw new Error(
        'Invariant: Missing `host` header from a forwarded Server Actions request.'
      )
    }

    const forwardedHeaders = getForwardedHeaders(req, res)
    forwardedHeaders.set(RSC_HEADER, '1')

    const proto = workStore.incrementalCache?.requestProtocol || 'https'

    // For standalone or the serverful mode, use the internal origin directly
    // other than the host headers from the request.
    const origin =
      process.env.__NEXT_PRIVATE_ORIGIN || `${proto}://${originalHost.value}`

    const fetchUrl = new URL(
      `${origin}${appRelativeRedirectUrl.pathname}${appRelativeRedirectUrl.search}`
    )

    if (workStore.revalidatedTags) {
      forwardedHeaders.set(
        NEXT_CACHE_REVALIDATED_TAGS_HEADER,
        workStore.revalidatedTags.join(',')
      )
      forwardedHeaders.set(
        NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER,
        workStore.incrementalCache?.prerenderManifest?.preview?.previewModeId ||
          ''
      )
    }

    // Ensures that when the path was revalidated we don't return a partial response on redirects
    forwardedHeaders.delete(NEXT_ROUTER_STATE_TREE_HEADER)
    // When an action follows a redirect, it's no longer handling an action: it's just a normal RSC request
    // to the requested URL. We should remove the `next-action` header so that it's not treated as an action
    forwardedHeaders.delete(ACTION_HEADER)

    try {
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

  return RenderResult.fromStatic('{}')
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

type ServerModuleMap = Record<
  string,
  {
    id: string
    chunks: string[]
    name: string
  }
>

type ServerActionsConfig = {
  bodySizeLimit?: SizeLimit
  allowedOrigins?: string[]
}

type HandleActionOpts = {
  req: BaseNextRequest
  res: BaseNextResponse
  ComponentMod: AppPageModule
  serverModuleMap: ServerModuleMap
  generateFlight: GenerateFlight
  workStore: WorkStore
  requestStore: RequestStore
  serverActions?: ServerActionsConfig
  ctx: AppRenderContext
}

type HandleActionReturn =
  | {
      type: 'not-found'
    }
  | {
      type: 'done'
      result: RenderResult | undefined
      formState?: any
    }

export async function handleAction(
  opts: HandleActionOpts
): Promise<HandleActionReturn | null> {
  const {
    req,
    res,
    ComponentMod,
    serverModuleMap,
    generateFlight,
    workStore,
    requestStore,
    serverActions,
    ctx,
  } = opts
  const contentType = req.headers['content-type']
  const { serverActionsManifest, page } = ctx.renderOpts

  const actionMetadata = getServerActionRequestMetadataNew(req)
  const { actionId, isFetchAction, isServerAction } =
    transformActionMetadata(actionMetadata)

  // If it's not a Server Action, skip handling.
  // TODO: app-render already checks if `isServerAction`, so this (and any codepaths handling nulls from here) is basically dead code
  if (!isServerAction || !actionMetadata) {
    return null
  }

  if (workStore.isStaticGeneration) {
    throw new Error(
      "Invariant: server actions can't be handled during static rendering"
    )
  }

  let temporaryReferences: TemporaryReferenceSet | undefined

  const finalizeAndGenerateFlight: GenerateFlight = (...args) => {
    // When we switch to the render phase, cookies() will return
    // `workUnitStore.cookies` instead of `workUnitStore.userspaceMutableCookies`.
    // We want the render to see any cookie writes that we performed during the action,
    // so we need to update the immutable cookies to reflect the changes.
    synchronizeMutableCookies(requestStore)
    requestStore.phase = 'render'
    return generateFlight(...args)
  }

  requestStore.phase = 'action'

  // When running actions the default is no-store, you can still `cache: 'force-cache'`
  workStore.fetchCache = 'default-no-store'

  const originDomain =
    typeof req.headers['origin'] === 'string'
      ? new URL(req.headers['origin']).host
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
  if (!originDomain) {
    // This might be an old browser that doesn't send `host` header. We ignore
    // this case.
    warning = 'Missing `origin` header from a forwarded Server Actions request.'
  } else if (!host || originDomain !== host.value) {
    // If the customer sets a list of allowed origins, we'll allow the request.
    // These are considered safe but might be different from forwarded host set
    // by the infra (i.e. reverse proxies).
    if (isCsrfOriginAllowed(originDomain, serverActions?.allowedOrigins)) {
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
            originDomain
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
        await Promise.all([
          workStore.incrementalCache?.revalidateTag(
            workStore.revalidatedTags || []
          ),
          ...Object.values(workStore.pendingRevalidates || {}),
          ...(workStore.pendingRevalidateWrites || []),
        ])

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
          result: await finalizeAndGenerateFlight(req, ctx, requestStore, {
            actionResult: promise,
            // if the page was not revalidated, we can skip the rendering the flight tree
            skipFlight: !workStore.pathWasRevalidated,
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

  const { actionAsyncStorage } = ComponentMod

  const actionWasForwarded = Boolean(req.headers['x-action-forwarded'])

  if (actionId) {
    const forwardedWorker = selectWorkerForForwarding(
      actionId,
      page,
      serverActionsManifest
    )

    // If forwardedWorker is truthy, it means there isn't a worker for the action
    // in the current handler, so we forward the request to a worker that has the action.
    if (forwardedWorker) {
      return {
        type: 'done',
        result: await createForwardedActionResponse(
          req,
          res,
          host,
          forwardedWorker,
          ctx.renderOpts.basePath,
          workStore
        ),
      }
    }
  }

  try {
    return await actionAsyncStorage.run(
      { isAction: true },
      async (): Promise<HandleActionReturn> => {
        if (
          // The type check here ensures that `req` is correctly typed, and the
          // environment variable check provides dead code elimination.
          process.env.NEXT_RUNTIME === 'edge' &&
          isWebNextRequest(req)
        ) {
          if (!req.body) {
            throw new Error('invariant: Missing request body.')
          }

          // TODO: add body limit

          // Use react-server-dom-webpack/server.edge
          const {
            createTemporaryReferenceSet,
            decodeReply,
            decodeAction,
            decodeFormState,
          } = ComponentMod

          temporaryReferences = createTemporaryReferenceSet()

          if (actionMetadata.kind === 'no-js') {
            const formData = await req.request.formData()
            return /* #__INLINE__ */ handleNoJsAction(
              formData,
              decodeAction,
              decodeFormState,
              warnBadServerActionRequest,
              opts
            )
          } else if (actionMetadata.kind === 'fetch') {
            const boundActionArguments =
              await /* #__INLINE__ */ decodeFetchActionBoundArgsEdge(
                actionMetadata,
                req,
                {
                  temporaryReferences,
                  serverModuleMap,
                  decodeReply,
                }
              )
            return /* #__INLINE__ */ handleFetchAction(
              actionMetadata.actionId,
              boundActionArguments,
              opts,
              // TODO: smelly
              {
                finalizeAndGenerateFlight,
                actionWasForwarded,
                temporaryReferences,
              }
            )
          } else {
            throw new InvariantError('Invalid actionMetadata kind')
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
            decodeAction,
            decodeFormState,
          } = require(
            `./react-server.node`
          ) as typeof import('./react-server.node')

          temporaryReferences = createTemporaryReferenceSet()

          const sizeLimit = resolveBodySizeLimit(serverActions)
          const body = getBodyStreamWithSizeLimit(req, sizeLimit)

          if (actionMetadata.kind === 'no-js') {
            // React doesn't yet publish a busboy version of decodeAction
            // so we polyfill the parsing of FormData.
            const formData = await /* #__INLINE__ */ parseFormDataNode(
              contentType,
              body
            )
            return /* #__INLINE__ */ handleNoJsAction(
              formData,
              decodeAction,
              decodeFormState,
              warnBadServerActionRequest,
              opts
            )
          } else if (actionMetadata.kind === 'fetch') {
            // TODO: if possible to get a null actionId here, we should error
            // also maybe try to resolve the handler before decoding so that we can 404?
            const boundActionArguments =
              await /* #__INLINE__ */ decodeFetchActionBoundArgsNode(
                actionMetadata,
                req,
                body,
                sizeLimit,
                { decodeReply, serverModuleMap, temporaryReferences }
              )
            return /* #__INLINE__ */ handleFetchAction(
              actionMetadata.actionId,
              boundActionArguments,
              opts,
              // TODO: smelly
              {
                finalizeAndGenerateFlight,
                actionWasForwarded,
                temporaryReferences,
              }
            )
          } else {
            throw new InvariantError('Invalid actionMetadata kind')
          }
        } else {
          throw new Error('Invariant: Unknown request type.')
        }
      }
    )
  } catch (err) {
    if (isRedirectError(err)) {
      const redirectUrl = getURLFromRedirectError(err)
      const redirectType = getRedirectTypeFromError(err)

      await addRevalidationHeader(res, {
        workStore,
        requestStore,
      })

      // if it's a fetch action, we'll set the status code for logging/debugging purposes
      // but we won't set a Location header, as the redirect will be handled by the client router
      res.statusCode = RedirectStatusCode.SeeOther

      if (isFetchAction) {
        return {
          type: 'done',
          result: await createRedirectRenderResult(
            req,
            res,
            host,
            redirectUrl,
            redirectType,
            ctx.renderOpts.basePath,
            workStore
          ),
        }
      }

      // If there were mutable cookies set, we need to set them on the
      // response.
      const headers = new Headers()
      if (appendMutableCookies(headers, requestStore.mutableCookies)) {
        res.setHeader('set-cookie', Array.from(headers.values()))
      }

      res.setHeader('Location', redirectUrl)
      return {
        type: 'done',
        result: RenderResult.fromStatic(''),
      }
    } else if (isHTTPAccessFallbackError(err)) {
      res.statusCode = getAccessFallbackHTTPStatus(err)

      await addRevalidationHeader(res, {
        workStore,
        requestStore,
      })

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
          result: await finalizeAndGenerateFlight(req, ctx, requestStore, {
            skipFlight: false,
            actionResult: promise,
            temporaryReferences,
          }),
        }
      }
      return {
        type: 'not-found',
      }
    }

    if (isFetchAction) {
      res.statusCode = 500
      await Promise.all([
        workStore.incrementalCache?.revalidateTag(
          workStore.revalidatedTags || []
        ),
        ...Object.values(workStore.pendingRevalidates || {}),
        ...(workStore.pendingRevalidateWrites || []),
      ])
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

      requestStore.phase = 'render'
      return {
        type: 'done',
        result: await generateFlight(req, ctx, requestStore, {
          actionResult: promise,
          // if the page was not revalidated, or if the action was forwarded from another worker, we can skip the rendering the flight tree
          skipFlight: !workStore.pathWasRevalidated || actionWasForwarded,
          temporaryReferences,
        }),
      }
    }

    throw err
  }
}

async function handleNoJsAction(
  formData: FormData,
  decodeAction: typeof import('react-server-dom-webpack/server.node').decodeAction,
  decodeFormState: typeof import('react-server-dom-webpack/server.node').decodeFormState,
  warnBadServerActionRequest: () => void,
  { serverModuleMap, requestStore }: HandleActionOpts
): Promise<HandleActionReturn> {
  const action = await decodeAction(formData, serverModuleMap)
  if (typeof action === 'function') {
    // Only warn if it's a server action, otherwise skip for other post requests
    warnBadServerActionRequest()

    const actionReturnedState = await workUnitAsyncStorage.run(
      requestStore,
      action
    )

    const formState = await decodeFormState(
      actionReturnedState,
      formData,
      serverModuleMap
    )

    requestStore.phase = 'render'
    return {
      type: 'done',
      result: undefined,
      formState,
    }
  } else {
    // TODO: is this correct? this should probably error somehow
    return { type: 'not-found' }
  }
}

async function handleFetchAction(
  actionId: string,
  boundActionArguments: unknown[],
  {
    req,
    res,
    ComponentMod,
    serverModuleMap,
    workStore,
    requestStore,
    ctx,
  }: HandleActionOpts,
  {
    finalizeAndGenerateFlight,
    actionWasForwarded,
    temporaryReferences,
  }: {
    finalizeAndGenerateFlight: GenerateFlight
    actionWasForwarded: boolean
    temporaryReferences: TemporaryReferenceSet
  }
): Promise<HandleActionReturn> {
  let actionModId: string
  try {
    actionModId = getActionModIdOrError(actionId, serverModuleMap)
  } catch (err) {
    if (actionId !== null) {
      console.error(err)
    }
    // TODO: where was this returning to??? nowhere!
    return {
      type: 'not-found',
    }
  }

  const actionHandler = (await ComponentMod.__next_app__.require(actionModId))[
    actionId
  ]

  const returnVal = await workUnitAsyncStorage.run(requestStore, () =>
    actionHandler.apply(null, boundActionArguments)
  )

  // For form actions, we need to continue rendering the page.
  await addRevalidationHeader(res, {
    workStore,
    requestStore,
  })

  const actionResult = await finalizeAndGenerateFlight(req, ctx, requestStore, {
    actionResult: Promise.resolve(returnVal),
    // if the page was not revalidated, or if the action was forwarded from another worker, we can skip the rendering the flight tree
    skipFlight: !workStore.pathWasRevalidated || actionWasForwarded,
    temporaryReferences,
  })

  return {
    type: 'done',
    result: actionResult,
    formState: undefined,
  }
}

async function decodeFetchActionBoundArgsEdge(
  actionMetadata: ServerActionMetadata & { kind: 'fetch' },
  req: WebNextRequest,
  {
    temporaryReferences,
    serverModuleMap,
    decodeReply,
  }: {
    temporaryReferences: TemporaryReferenceSet
    serverModuleMap: ServerModuleMap
    decodeReply: typeof import('react-server-dom-webpack/server.node').decodeReply
  }
) {
  if (actionMetadata.encoding === 'form') {
    // TODO-APP: Add streaming support
    // isfetchAction, we checked for the negative above
    const formData = await req.request.formData()
    return await decodeReply(formData, serverModuleMap, {
      temporaryReferences,
    })
  } else {
    // url-encoded action
    const chunks: Buffer[] = []
    for await (const chunk of req.request.body!) {
      chunks.push(Buffer.from(chunk))
    }

    const actionData = Buffer.concat(chunks).toString('utf-8')
    const body = formDataFromSearchQueryString(actionData)

    return await decodeReply(body, serverModuleMap, {
      temporaryReferences,
    })
  }
}

async function decodeFetchActionBoundArgsNode(
  actionMetadata: ServerActionMetadata & { kind: 'fetch' },
  req: NodeNextRequest,
  body: Transform,
  sizeLimit: ResolvedSizeLimit,
  {
    temporaryReferences,
    serverModuleMap,
    decodeReply,
  }: {
    temporaryReferences: TemporaryReferenceSet
    serverModuleMap: ServerModuleMap
    decodeReply: typeof import('react-server-dom-webpack/server.node').decodeReply
  }
) {
  if (actionMetadata.encoding === 'form') {
    return await decodeReplyNode(
      req.headers,
      body,
      sizeLimit,
      serverModuleMap,
      temporaryReferences
    )
  } else {
    const chunks: Buffer[] = []
    for await (const chunk of req.body) {
      chunks.push(Buffer.from(chunk))
    }

    const actionData = Buffer.concat(chunks).toString('utf-8')
    const formData = formDataFromSearchQueryString(actionData)

    return await decodeReply(formData, serverModuleMap, {
      temporaryReferences,
    })
  }
}

async function decodeReplyNode(
  headers: NodeNextRequest['headers'],
  body: Transform,
  sizeLimit: ResolvedSizeLimit,
  serverModuleMap: ServerModuleMap,
  temporaryReferences: TemporaryReferenceSet | undefined
) {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError('decodeReplyNode cannot be used in edge runtime')
  } else {
    // NOTE: this branch must be wrapped in an `else` to DCE properly for edge, an early return won't work
    const { decodeReplyFromBusboy } = require(
      `./react-server.node`
    ) as typeof import('./react-server.node')
    const busboy = (require('busboy') as typeof import('busboy'))({
      defParamCharset: 'utf8',
      headers: headers,
      limits: { fieldSize: sizeLimit.bytes },
    })

    body.pipe(busboy)

    return await decodeReplyFromBusboy(busboy, serverModuleMap, {
      temporaryReferences,
    })
  }
}

async function parseFormDataNode(
  contentType: string | undefined,
  body: Transform
) {
  const fakeRequest = new Request('http://localhost', {
    method: 'POST',
    // @ts-expect-error
    headers: { 'Content-Type': contentType },
    body: new ReadableStream({
      start: (controller) => {
        body.on('data', (chunk) => {
          controller.enqueue(new Uint8Array(chunk))
        })
        body.on('end', () => {
          controller.close()
        })
        body.on('error', (err) => {
          controller.error(err)
        })
      },
    }),
    duplex: 'half',
  })
  const formData = await fakeRequest.formData()
  return formData
}

type ResolvedSizeLimit = {
  humanReadable: SizeLimit
  bytes: number
}

function resolveBodySizeLimit(
  config: ServerActionsConfig | undefined
): ResolvedSizeLimit {
  const defaultBodySizeLimit = '1 MB'
  const bodySizeLimit = config?.bodySizeLimit ?? defaultBodySizeLimit
  const bodySizeLimitBytes =
    bodySizeLimit !== defaultBodySizeLimit
      ? (require('next/dist/compiled/bytes') as typeof import('bytes')).parse(
          bodySizeLimit
        )
      : 1024 * 1024 // 1 MB
  return {
    humanReadable: bodySizeLimit,
    bytes: bodySizeLimitBytes,
  }
}

function getBodyStreamWithSizeLimit(
  req: NodeNextRequest,
  limits: ResolvedSizeLimit
) {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      'getBodyStreamWithSizeLimit cannot be used in edge runtime'
    )
  } else {
    // NOTE: this branch must be wrapped in an `else` to DCE properly for edge, an early return won't work
    const { Transform } = require('node:stream') as typeof import('node:stream')

    let size = 0
    return req.body.pipe(
      new Transform({
        transform(chunk, encoding, callback) {
          size += Buffer.byteLength(chunk, encoding)
          if (size > limits.bytes) {
            const { ApiError } = require('../api-utils')

            callback(
              new ApiError(
                413,
                `Body exceeded ${limits.humanReadable} limit.
                  To configure the body size limit for Server Actions, see: https://nextjs.org/docs/app/api-reference/next-config-js/serverActions#bodysizelimit`
              )
            )
            return
          }

          callback(null, chunk)
        },
      })
    )
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
): string {
  try {
    // if we're missing the action ID header, we can't do any further processing
    if (!actionId) {
      throw new Error("Invariant: Missing 'next-action' header.")
    }

    const actionModId = serverModuleMap?.[actionId]?.id

    if (!actionModId) {
      throw new Error(
        "Invariant: Couldn't find action module ID from module map."
      )
    }

    return actionModId
  } catch (err) {
    throw new Error(
      `Failed to find Server Action "${actionId}". This request might be from an older or newer deployment. ${
        err instanceof Error ? `Original error: ${err.message}` : ''
      }`
    )
  }
}
