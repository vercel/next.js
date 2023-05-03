import type {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'http'
import type { WebNextRequest } from '../base-http/web'

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
import { StaticGenerationStore } from '../../client/components/static-generation-async-storage'
import { FlightRenderResult } from './flight-render-result'
import { ActionResult } from './types'
import { ActionAsyncStorage } from '../../client/components/action-async-storage'

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
  const mergedHeaders = {
    ...nodeHeadersToRecord(requestHeaders),
    ...nodeHeadersToRecord(responseHeaders),
  }

  // Merge cookies
  const mergedCookies = requestCookies.split('; ').concat(setCookies).join('; ')

  // Update the 'cookie' header with the merged cookies
  mergedHeaders['cookie'] = mergedCookies

  // Remove headers that should not be forwarded
  delete mergedHeaders['transfer-encoding']

  return new Headers(mergedHeaders)
}

function fetchIPv4v6(
  url: URL,
  init: RequestInit,
  v6 = false
): Promise<Response> {
  const hostname = url.hostname

  if (!v6 && hostname === 'localhost') {
    url.hostname = '127.0.0.1'
  }
  return fetch(url, init).catch((err) => {
    if (err.code === 'ECONNREFUSED' && !v6) {
      return fetchIPv4v6(url, init, true)
    }
    throw err
  })
}

async function createRedirectRenderResult(
  req: IncomingMessage,
  res: ServerResponse,
  redirectUrl: string,
  staticGenerationStore: StaticGenerationStore
) {
  // if we're redirecting to a relative path, we'll try to stream the response
  if (redirectUrl.startsWith('/')) {
    const forwardedHeaders = getForwardedHeaders(req, res)
    forwardedHeaders.set(RSC, '1')

    const host = req.headers['host']
    const proto =
      staticGenerationStore.incrementalCache?.requestProtocol || 'https'
    const fetchUrl = new URL(`${proto}://${host}${redirectUrl}`)

    try {
      const headResponse = await fetchIPv4v6(fetchUrl, {
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
        const response = await fetchIPv4v6(fetchUrl, {
          method: 'GET',
          headers: forwardedHeaders,
          next: {
            // @ts-ignore
            internal: 1,
          },
        })
        // copy the headers from the redirect response to the response we're sending
        for (const [key, value] of response.headers) {
          res.setHeader(key, value)
        }

        return new FlightRenderResult(response.body!)
      }
    } catch (err) {
      // we couldn't stream the redirect response, so we'll just do a normal redirect
    }
  }
  return new RenderResult(JSON.stringify({}))
}

export async function handleAction({
  req,
  res,
  ComponentMod,
  pathname,
  serverActionsManifest,
  generateFlight,
  staticGenerationStore,
}: {
  req: IncomingMessage
  res: ServerResponse
  ComponentMod: any
  pathname: string
  serverActionsManifest: any
  generateFlight: (options: {
    actionResult: ActionResult
    skipFlight: boolean
  }) => Promise<RenderResult>
  staticGenerationStore: StaticGenerationStore
}): Promise<undefined | RenderResult | 'not-found'> {
  let actionId = req.headers[ACTION.toLowerCase()] as string
  const contentType = req.headers['content-type']
  const isFormAction =
    req.method === 'POST' && contentType === 'application/x-www-form-urlencoded'
  const isMultipartAction =
    req.method === 'POST' && contentType?.startsWith('multipart/form-data')

  const isFetchAction =
    actionId !== undefined &&
    typeof actionId === 'string' &&
    req.method === 'POST'

  if (isFetchAction || isFormAction || isMultipartAction) {
    let bound = []

    const workerName = 'app' + pathname
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

    try {
      await actionAsyncStorage.run({ isAction: true }, async () => {
        if (process.env.NEXT_RUNTIME === 'edge') {
          // Use react-server-dom-webpack/server.edge
          const { decodeReply } = ComponentMod

          const webRequest = req as unknown as WebNextRequest
          if (!webRequest.body) {
            throw new Error('invariant: Missing request body.')
          }

          if (isMultipartAction) {
            // TODO-APP: Add streaming support
            const formData = await webRequest.request.formData()
            bound = await decodeReply(formData, serverModuleMap)
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

            if (isFormAction) {
              const formData = formDataFromSearchQueryString(actionData)
              actionId = formData.get('$$id') as string

              if (!actionId) {
                // Return if no action ID is found, it could be a regular POST request
                return
              }
              formData.delete('$$id')
              bound = [formData]
            } else {
              bound = await decodeReply(actionData, serverModuleMap)
            }
          }
        } else {
          // Use react-server-dom-webpack/server.node which supports streaming
          const {
            decodeReply,
            decodeReplyFromBusboy,
          } = require(`react-server-dom-webpack/server.node`)

          if (isMultipartAction) {
            const busboy = require('busboy')
            const bb = busboy({ headers: req.headers })
            req.pipe(bb)

            bound = await decodeReplyFromBusboy(bb, serverModuleMap)
          } else {
            const { parseBody } =
              require('../api-utils/node') as typeof import('../api-utils/node')
            const actionData = (await parseBody(req, '1mb')) || ''

            if (isFormAction) {
              actionId = actionData.$$id as string
              if (!actionId) {
                // Return if no action ID is found, it could be a regular POST request
                return
              }
              const formData = formDataFromSearchQueryString(actionData)
              formData.delete('$$id')
              bound = [formData]
            } else {
              bound = await decodeReply(actionData, serverModuleMap)
            }
          }
        }

        const actionModId =
          serverActionsManifest[
            process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
          ][actionId].workers[workerName]
        const actionHandler =
          ComponentMod.__next_app_webpack_require__(actionModId)[actionId]

        const returnVal = await actionHandler.apply(null, bound)

        // For form actions, we need to continue rendering the page.
        if (isFetchAction) {
          await Promise.all(staticGenerationStore.pendingRevalidates || [])

          actionResult = await generateFlight({
            actionResult: Promise.resolve(returnVal),
            // if the page was not revalidated, we can skip the rendering the flight tree
            skipFlight: !staticGenerationStore.pathWasRevalidated,
          })
        }
      })

      if (actionResult) {
        return actionResult
      }
    } catch (err) {
      if (isRedirectError(err)) {
        if (process.env.NEXT_RUNTIME === 'edge') {
          throw new Error('Invariant: not implemented.')
        }
        const redirectUrl = getURLFromRedirectError(err)

        // if it's a fetch action, we don't want to mess with the status code
        // and we'll handle it on the client router
        res.setHeader('Location', redirectUrl)
        await Promise.all(staticGenerationStore.pendingRevalidates || [])

        if (isFetchAction) {
          return createRedirectRenderResult(
            req,
            res,
            redirectUrl,
            staticGenerationStore
          )
        }

        res.statusCode = 303
        return new RenderResult('')
      } else if (isNotFoundError(err)) {
        if (isFetchAction) {
          throw new Error('Invariant: not implemented.')
        }
        await Promise.all(staticGenerationStore.pendingRevalidates || [])
        res.statusCode = 404
        return 'not-found'
      }

      if (isFetchAction) {
        res.statusCode = 500
        const rejectedPromise = Promise.reject(err)
        try {
          // we need to await the promise to trigger the rejection early
          // so that it's already handled by the time we call
          // the RSC runtime. Otherwise, it will throw an unhandled
          // promise rejection error in the renderer.
          await rejectedPromise
        } catch (_) {
          // swallow error, it's gonna be handled on the client
        }
        return generateFlight({
          actionResult: rejectedPromise,
          // if the page was not revalidated, we can skip the rendering the flight tree
          skipFlight: !staticGenerationStore.pathWasRevalidated,
        })
      }

      throw err
    }
  }
}
