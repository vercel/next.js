import type {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'http'
import type { WebNextRequest } from '../base-http/web'
import type { SizeLimit } from '../../../types'
import type { RequestStore } from '../../client/components/request-async-storage.external'
import type { AppRenderContext, GenerateFlight } from './app-render'
import type { AppPageModule } from '../../server/future/route-modules/app-page/module'

import {
  RSC_HEADER,
  RSC_CONTENT_TYPE_HEADER,
} from '../../client/components/app-router-headers'
import { isNotFoundError } from '../../client/components/not-found'
import {
  getRedirectStatusCodeFromError,
  getURLFromRedirectError,
  isRedirectError,
} from '../../client/components/redirect'
import RenderResult from '../render-result'
import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'
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
  getIsServerAction,
  getServerActionRequestMetadata,
} from '../lib/server-action-request-meta'
import { isCsrfOriginAllowed } from './csrf-protection'
import { warn } from '../../build/output/log'
import { RequestCookies, ResponseCookies } from '../web/spec-extension/cookies'
import { HeadersAdapter } from '../web/spec-extension/adapters/headers'
import { fromNodeOutgoingHttpHeaders } from '../web/utils'

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
  req: IncomingMessage,
  res: ServerResponse
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
  res: ServerResponse,
  {
    staticGenerationStore,
    requestStore,
  }: {
    staticGenerationStore: StaticGenerationStore
    requestStore: RequestStore
  }
) {
  await Promise.all(
    Object.values(staticGenerationStore.pendingRevalidates || [])
  )

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

  const isTagRevalidated = staticGenerationStore.revalidatedTags?.length ? 1 : 0
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

async function createRedirectRenderResult(
  req: IncomingMessage,
  res: ServerResponse,
  originalHost: Host,
  redirectUrl: string,
  basePath: string,
  staticGenerationStore: StaticGenerationStore
) {
  res.setHeader('x-action-redirect', redirectUrl)

  // If we're redirecting to another route of this Next.js application, we'll
  // try to stream the response from the other worker path. When that works,
  // we can save an extra roundtrip and avoid a full page reload.
  // When the redirect URL starts with a `/`, or to the same host as application,
  // we treat it as an app-relative redirect.
  const parsedRedirectUrl = new URL(redirectUrl, 'http://n')
  const isAppRelativeRedirect =
    redirectUrl.startsWith('/') ||
    (originalHost && originalHost.value === parsedRedirectUrl.host)

  if (isAppRelativeRedirect) {
    if (!originalHost) {
      throw new Error(
        'Invariant: Missing `host` header from a forwarded Server Actions request.'
      )
    }

    const forwardedHeaders = getForwardedHeaders(req, res)
    forwardedHeaders.set(RSC_HEADER, '1')

    const proto =
      staticGenerationStore.incrementalCache?.requestProtocol || 'https'

    // For standalone or the serverful mode, use the internal hostname directly
    // other than the headers from the request.
    const host = process.env.__NEXT_PRIVATE_HOST || originalHost.value

    const fetchUrl = new URL(
      `${proto}://${host}${basePath}${parsedRedirectUrl.pathname}${parsedRedirectUrl.search}`
    )

    if (staticGenerationStore.revalidatedTags) {
      forwardedHeaders.set(
        NEXT_CACHE_REVALIDATED_TAGS_HEADER,
        staticGenerationStore.revalidatedTags.join(',')
      )
      forwardedHeaders.set(
        NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER,
        staticGenerationStore.incrementalCache?.prerenderManifest?.preview
          ?.previewModeId || ''
      )
    }

    // Ensures that when the path was revalidated we don't return a partial response on redirects
    // if (staticGenerationStore.pathWasRevalidated) {
    forwardedHeaders.delete('next-router-state-tree')
    // }

    try {
      const headResponse = await fetch(fetchUrl, {
        method: 'HEAD',
        headers: forwardedHeaders,
        next: {
          // @ts-ignore
          internal: 1,
        },
      })

      if (
        headResponse.headers.get('content-type') === RSC_CONTENT_TYPE_HEADER
      ) {
        const response = await fetch(fetchUrl, {
          method: 'GET',
          headers: forwardedHeaders,
          next: {
            // @ts-ignore
            internal: 1,
          },
        })
        // copy the headers from the redirect response to the response we're sending
        for (const [key, value] of response.headers) {
          if (!actionsForbiddenHeaders.includes(key)) {
            res.setHeader(key, value)
          }
        }

        return new FlightRenderResult(response.body!)
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

type ServerModuleMap = Record<
  string,
  | {
      id: string
      chunks: string[]
      name: string
    }
  | undefined
>

export async function handleAction({
  req,
  res,
  ComponentMod,
  serverModuleMap,
  generateFlight,
  staticGenerationStore,
  requestStore,
  serverActions,
  ctx,
}: {
  req: IncomingMessage
  res: ServerResponse
  ComponentMod: AppPageModule
  serverModuleMap: ServerModuleMap
  generateFlight: GenerateFlight
  staticGenerationStore: StaticGenerationStore
  requestStore: RequestStore
  serverActions?: {
    bodySizeLimit?: SizeLimit
    allowedOrigins?: string[]
  }
  ctx: AppRenderContext
}): Promise<
  | undefined
  | {
      type: 'not-found'
    }
  | {
      type: 'done'
      result: RenderResult | undefined
      formState?: any
    }
> {
  const contentType = req.headers['content-type']

  const { actionId, isURLEncodedAction, isMultipartAction, isFetchAction } =
    getServerActionRequestMetadata(req)

  // If it's not a Server Action, skip handling.
  if (!getIsServerAction(req)) {
    return
  }

  if (staticGenerationStore.isStaticGeneration) {
    throw new Error(
      "Invariant: server actions can't be handled during static rendering"
    )
  }

  // When running actions the default is no-store, you can still `cache: 'force-cache'`
  staticGenerationStore.fetchCache = 'default-no-store'

  const originDomain =
    typeof req.headers['origin'] === 'string'
      ? new URL(req.headers['origin']).host
      : undefined

  const forwardedHostHeader = req.headers['x-forwarded-host'] as
    | string
    | undefined
  const hostHeader = req.headers['host']
  const host: Host = forwardedHostHeader
    ? {
        type: HostType.XForwardedHost,
        value: forwardedHostHeader,
      }
    : hostHeader
    ? {
        type: HostType.Host,
        value: hostHeader,
      }
    : undefined

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
        await Promise.all(
          Object.values(staticGenerationStore.pendingRevalidates || [])
        )

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
          result: await generateFlight(ctx, {
            actionResult: promise,
            // if the page was not revalidated, we can skip the rendering the flight tree
            skipFlight: !staticGenerationStore.pathWasRevalidated,
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
  let bound = []

  const { actionAsyncStorage } = ComponentMod

  let actionResult: RenderResult | undefined
  let formState: any | undefined
  let actionModId: string | undefined

  try {
    await actionAsyncStorage.run({ isAction: true }, async () => {
      if (process.env.NEXT_RUNTIME === 'edge') {
        // Use react-server-dom-webpack/server.edge
        const { decodeReply, decodeAction, decodeFormState } = ComponentMod

        const webRequest = req as unknown as WebNextRequest
        if (!webRequest.body) {
          throw new Error('invariant: Missing request body.')
        }

        if (isMultipartAction) {
          // TODO-APP: Add streaming support
          const formData = await webRequest.request.formData()
          if (isFetchAction) {
            bound = await decodeReply(formData, serverModuleMap)
          } else {
            const action = await decodeAction(formData, serverModuleMap)
            if (typeof action === 'function') {
              // Only warn if it's a server action, otherwise skip for other post requests
              warnBadServerActionRequest()
              const actionReturnedState = await action()
              formState = decodeFormState(actionReturnedState, formData)
            }

            // Skip the fetch path
            return
          }
        } else {
          try {
            actionModId = getActionModIdOrError(actionId, serverModuleMap)
          } catch (err) {
            console.error(err)
            return {
              type: 'not-found',
            }
          }

          let actionData = ''

          const reader = webRequest.body.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }

            actionData += new TextDecoder().decode(value)
          }

          if (isURLEncodedAction) {
            const formData = formDataFromSearchQueryString(actionData)
            bound = await decodeReply(formData, serverModuleMap)
          } else {
            bound = await decodeReply(actionData, serverModuleMap)
          }
        }
      } else {
        // Use react-server-dom-webpack/server.node which supports streaming
        const {
          decodeReply,
          decodeReplyFromBusboy,
          decodeAction,
          decodeFormState,
        } = require(`./react-server.node`)

        if (isMultipartAction) {
          if (isFetchAction) {
            const busboy = require('busboy')
            const bb = busboy({ headers: req.headers })
            req.pipe(bb)

            bound = await decodeReplyFromBusboy(bb, serverModuleMap)
          } else {
            // Convert the Node.js readable stream to a Web Stream.
            const readableStream = new ReadableStream({
              start(controller) {
                req.on('data', (chunk) => {
                  controller.enqueue(new Uint8Array(chunk))
                })
                req.on('end', () => {
                  controller.close()
                })
                req.on('error', (err) => {
                  controller.error(err)
                })
              },
            })

            // React doesn't yet publish a busboy version of decodeAction
            // so we polyfill the parsing of FormData.
            const fakeRequest = new Request('http://localhost', {
              method: 'POST',
              // @ts-expect-error
              headers: { 'Content-Type': contentType },
              body: readableStream,
              duplex: 'half',
            })
            const formData = await fakeRequest.formData()
            const action = await decodeAction(formData, serverModuleMap)
            if (typeof action === 'function') {
              // Only warn if it's a server action, otherwise skip for other post requests
              warnBadServerActionRequest()
              const actionReturnedState = await action()
              formState = await decodeFormState(actionReturnedState, formData)
            }

            // Skip the fetch path
            return
          }
        } else {
          try {
            actionModId = getActionModIdOrError(actionId, serverModuleMap)
          } catch (err) {
            console.error(err)
            return {
              type: 'not-found',
            }
          }

          const chunks = []

          for await (const chunk of req) {
            chunks.push(Buffer.from(chunk))
          }

          const actionData = Buffer.concat(chunks).toString('utf-8')

          const readableLimit = serverActions?.bodySizeLimit ?? '1 MB'
          const limit = require('next/dist/compiled/bytes').parse(readableLimit)

          if (actionData.length > limit) {
            const { ApiError } = require('../api-utils')
            throw new ApiError(
              413,
              `Body exceeded ${readableLimit} limit.
To configure the body size limit for Server Actions, see: https://nextjs.org/docs/app/api-reference/next-config-js/serverActions#bodysizelimit`
            )
          }

          if (isURLEncodedAction) {
            const formData = formDataFromSearchQueryString(actionData)
            bound = await decodeReply(formData, serverModuleMap)
          } else {
            bound = await decodeReply(actionData, serverModuleMap)
          }
        }
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

      try {
        actionModId =
          actionModId ?? getActionModIdOrError(actionId, serverModuleMap)
      } catch (err) {
        console.error(err)
        return {
          type: 'not-found',
        }
      }

      const actionHandler = (
        await ComponentMod.__next_app__.require(actionModId)
      )[
        // `actionId` must exist if we got here, as otherwise we would have thrown an error above
        actionId!
      ]

      const returnVal = await actionHandler.apply(null, bound)

      // For form actions, we need to continue rendering the page.
      if (isFetchAction) {
        await addRevalidationHeader(res, {
          staticGenerationStore,
          requestStore,
        })

        actionResult = await generateFlight(ctx, {
          actionResult: Promise.resolve(returnVal),
          // if the page was not revalidated, we can skip the rendering the flight tree
          skipFlight: !staticGenerationStore.pathWasRevalidated,
        })
      }
    })

    return {
      type: 'done',
      result: actionResult,
      formState,
    }
  } catch (err) {
    if (isRedirectError(err)) {
      const redirectUrl = getURLFromRedirectError(err)
      const statusCode = getRedirectStatusCodeFromError(err)

      await addRevalidationHeader(res, {
        staticGenerationStore,
        requestStore,
      })

      // if it's a fetch action, we'll set the status code for logging/debugging purposes
      // but we won't set a Location header, as the redirect will be handled by the client router
      res.statusCode = statusCode

      if (isFetchAction) {
        return {
          type: 'done',
          result: await createRedirectRenderResult(
            req,
            res,
            host,
            redirectUrl,
            ctx.renderOpts.basePath,
            staticGenerationStore
          ),
        }
      }

      if (err.mutableCookies) {
        const headers = new Headers()

        // If there were mutable cookies set, we need to set them on the
        // response.
        if (appendMutableCookies(headers, err.mutableCookies)) {
          res.setHeader('set-cookie', Array.from(headers.values()))
        }
      }

      res.setHeader('Location', redirectUrl)
      return {
        type: 'done',
        result: RenderResult.fromStatic(''),
      }
    } else if (isNotFoundError(err)) {
      res.statusCode = 404

      await addRevalidationHeader(res, {
        staticGenerationStore,
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
          result: await generateFlight(ctx, {
            skipFlight: false,
            actionResult: promise,
            asNotFound: true,
          }),
        }
      }
      return {
        type: 'not-found',
      }
    }

    if (isFetchAction) {
      res.statusCode = 500
      await Promise.all(
        Object.values(staticGenerationStore.pendingRevalidates || [])
      )
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
        result: await generateFlight(ctx, {
          actionResult: promise,
          // if the page was not revalidated, we can skip the rendering the flight tree
          skipFlight: !staticGenerationStore.pathWasRevalidated,
        }),
      }
    }

    throw err
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
