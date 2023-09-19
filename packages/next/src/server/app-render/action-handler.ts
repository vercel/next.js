import type {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'http'
import type { WebNextRequest } from '../base-http/web'
import type { SizeLimit } from '../../../types'
import type { ApiError } from '../api-utils'

import {
  ACTION,
  RSC,
  RSC_CONTENT_TYPE_HEADER,
} from '../../client/components/app-router-headers'
import { isNotFoundError } from '../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
} from '../../client/components/redirect'
import RenderResult from '../render-result'
import { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'
import { FlightRenderResult } from './flight-render-result'
import { ActionResult } from './types'
import { ActionAsyncStorage } from '../../client/components/action-async-storage.external'
import {
  filterReqHeaders,
  actionsForbiddenHeaders,
} from '../lib/server-ipc/utils'
import {
  appendMutableCookies,
  getModifiedCookieValues,
} from '../web/spec-extension/adapters/request-cookies'

import { RequestStore } from '../../client/components/request-async-storage.external'
import {
  NEXT_CACHE_REVALIDATED_TAGS_HEADER,
  NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER,
} from '../../lib/constants'

function nodeToWebReadableStream(nodeReadable: import('stream').Readable) {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    const { Readable } = require('stream')
    if ('toWeb' in Readable && typeof Readable.toWeb === 'function') {
      return Readable.toWeb(nodeReadable)
    }

    return new ReadableStream({
      start(controller) {
        nodeReadable.on('data', (chunk) => {
          controller.enqueue(chunk)
        })

        nodeReadable.on('end', () => {
          controller.close()
        })

        nodeReadable.on('error', (error) => {
          controller.error(error)
        })
      },
    })
  } else {
    throw new Error('Invalid runtime')
  }
}

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
  const requestCookies = requestHeaders['cookie'] ?? ''

  // Get response headers and Set-Cookie header
  const responseHeaders = res.getHeaders()
  const rawSetCookies = responseHeaders['set-cookie']
  const setCookies = (
    Array.isArray(rawSetCookies) ? rawSetCookies : [rawSetCookies]
  ).map((setCookie) => {
    // remove the suffixes like 'HttpOnly' and 'SameSite'
    const [cookie] = `${setCookie}`.split(';')
    return cookie
  })

  // Merge request and response headers
  const mergedHeaders = filterReqHeaders(
    {
      ...nodeHeadersToRecord(requestHeaders),
      ...nodeHeadersToRecord(responseHeaders),
    },
    actionsForbiddenHeaders
  ) as Record<string, string>

  // Merge cookies
  const mergedCookies = requestCookies.split('; ').concat(setCookies).join('; ')

  // Update the 'cookie' header with the merged cookies
  mergedHeaders['cookie'] = mergedCookies

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
  await Promise.all(staticGenerationStore.pendingRevalidates || [])

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
  redirectUrl: string,
  staticGenerationStore: StaticGenerationStore
) {
  res.setHeader('x-action-redirect', redirectUrl)
  // if we're redirecting to a relative path, we'll try to stream the response
  if (redirectUrl.startsWith('/')) {
    const forwardedHeaders = getForwardedHeaders(req, res)
    forwardedHeaders.set(RSC, '1')

    const host = req.headers['host']
    const proto =
      staticGenerationStore.incrementalCache?.requestProtocol || 'https'
    const fetchUrl = new URL(`${proto}://${host}${redirectUrl}`)

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
  return new RenderResult(JSON.stringify({}))
}

export async function handleAction({
  req,
  res,
  ComponentMod,
  page,
  serverActionsManifest,
  generateFlight,
  staticGenerationStore,
  requestStore,
  serverActionsBodySizeLimit,
}: {
  req: IncomingMessage
  res: ServerResponse
  ComponentMod: any
  page: string
  serverActionsManifest: any
  generateFlight: (options: {
    actionResult: ActionResult
    formState?: any
    skipFlight: boolean
    asNotFound?: boolean
  }) => Promise<RenderResult>
  staticGenerationStore: StaticGenerationStore
  requestStore: RequestStore
  serverActionsBodySizeLimit?: SizeLimit
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
  let actionId = req.headers[ACTION.toLowerCase()] as string
  const contentType = req.headers['content-type']
  const isURLEncodedAction =
    req.method === 'POST' && contentType === 'application/x-www-form-urlencoded'
  const isMultipartAction =
    req.method === 'POST' && contentType?.startsWith('multipart/form-data')

  const isFetchAction =
    actionId !== undefined &&
    typeof actionId === 'string' &&
    req.method === 'POST'

  if (isFetchAction || isURLEncodedAction || isMultipartAction) {
    // ensure we avoid caching server actions unexpectedly
    res.setHeader(
      'Cache-Control',
      'no-cache, no-store, max-age=0, must-revalidate'
    )
    let bound = []

    const workerName = 'app' + page
    const serverModuleMap = new Proxy(
      {},
      {
        get: (_, id: string) => {
          return {
            id: serverActionsManifest[
              process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
            ][id].workers[workerName],
            name: id,
            chunks: [],
          }
        },
      }
    )

    const { actionAsyncStorage } = ComponentMod as {
      actionAsyncStorage: ActionAsyncStorage
    }

    let actionResult: RenderResult | undefined
    let formState: any | undefined

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
              const actionReturnedState = await action()
              formState = decodeFormState(actionReturnedState, formData)

              // Skip the fetch path
              return
            }
          } else {
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
              // React doesn't yet publish a busboy version of decodeAction
              // so we polyfill the parsing of FormData.
              const UndiciRequest = require('next/dist/compiled/undici').Request
              const fakeRequest = new UndiciRequest('http://localhost', {
                method: 'POST',
                headers: { 'Content-Type': req.headers['content-type'] },
                body: nodeToWebReadableStream(req),
                duplex: 'half',
              })
              const formData = await fakeRequest.formData()
              const action = await decodeAction(formData, serverModuleMap)
              const actionReturnedState = await action()
              formState = await decodeFormState(actionReturnedState, formData)

              // Skip the fetch path
              return
            }
          } else {
            const { parseBody } =
              require('../api-utils/node/parse-body') as typeof import('../api-utils/node/parse-body')

            let actionData
            try {
              actionData =
                (await parseBody(req, serverActionsBodySizeLimit ?? '1mb')) ||
                ''
            } catch (e: any) {
              if (e && (e as ApiError).statusCode === 413) {
                // Exceeded the size limit
                e.message =
                  e.message +
                  '\nTo configure the body size limit for Server Actions, see: https://nextjs.org/docs/app/api-reference/server-actions#size-limitation'
              }
              throw e
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

        const actionModId =
          serverActionsManifest[
            process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
          ][actionId].workers[workerName]
        const actionHandler =
          ComponentMod.__next_app__.require(actionModId)[actionId]

        const returnVal = await actionHandler.apply(null, bound)

        // For form actions, we need to continue rendering the page.
        if (isFetchAction) {
          await addRevalidationHeader(res, {
            staticGenerationStore,
            requestStore,
          })

          actionResult = await generateFlight({
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

        // if it's a fetch action, we don't want to mess with the status code
        // and we'll handle it on the client router
        await addRevalidationHeader(res, {
          staticGenerationStore,
          requestStore,
        })

        if (isFetchAction) {
          return {
            type: 'done',
            result: await createRedirectRenderResult(
              req,
              res,
              redirectUrl,
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
        res.statusCode = 303
        return {
          type: 'done',
          result: new RenderResult(''),
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
            await promise
          } catch {}
          return {
            type: 'done',
            result: await generateFlight({
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
        await Promise.all(staticGenerationStore.pendingRevalidates || [])
        const promise = Promise.reject(err)
        try {
          await promise
        } catch {}

        return {
          type: 'done',
          result: await generateFlight({
            actionResult: promise,
            // if the page was not revalidated, we can skip the rendering the flight tree
            skipFlight: !staticGenerationStore.pathWasRevalidated,
          }),
        }
      }

      throw err
    }
  }
}
