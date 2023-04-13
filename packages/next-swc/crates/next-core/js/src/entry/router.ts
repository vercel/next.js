import type { Ipc, StructuredError } from '@vercel/turbopack-node/ipc/index'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { createServer, makeRequest } from '../internal/server'
import { toPairs } from '../internal/headers'
import {
  makeResolver,
  RouteResult,
  ServerAddress,
} from 'next/dist/server/lib/route-resolver'
import loadConfig from 'next/dist/server/config'
import { PHASE_DEVELOPMENT_SERVER } from 'next/dist/shared/lib/constants'

import 'next/dist/server/node-polyfill-fetch.js'

import middlewareChunkGroup from 'MIDDLEWARE_CHUNK_GROUP'
import middlewareConfig from 'MIDDLEWARE_CONFIG'

type RouterRequest = {
  method: string
  pathname: string
  rawHeaders: [string, string][]
  rawQuery: string
}

type IpcOutgoingMessage = {
  type: 'value'
  data: string | Buffer
}

type MessageData =
  | { type: 'middleware-headers'; data: MiddlewareHeadersResponse }
  | { type: 'middleware-body'; data: Uint8Array }
  | {
      type: 'rewrite'
      data: RewriteResponse
    }
  | {
      type: 'error'
      error: StructuredError
    }
  | { type: 'none' }

type RewriteResponse = {
  url: string
  headers: [string, string][]
}

type MiddlewareHeadersResponse = {
  statusCode: number
  headers: [string, string][]
}

let resolveRouteMemo: Promise<
  (req: IncomingMessage, res: ServerResponse) => Promise<void>
>

async function getResolveRoute(
  dir: string,
  serverAddr: Partial<ServerAddress>
): ReturnType<
  typeof import('next/dist/server/lib/route-resolver').makeResolver
> {
  const nextConfig = await loadConfig(
    PHASE_DEVELOPMENT_SERVER,
    process.cwd(),
    undefined,
    undefined,
    true
  )
  const middlewareCfg = {
    files: middlewareChunkGroup.filter((f) => /\.[mc]?js$/.test(f)),
    matcher: middlewareConfig.matcher,
  }

  return await makeResolver(dir, nextConfig, middlewareCfg, serverAddr)
}

export default async function route(
  ipc: Ipc<RouterRequest, IpcOutgoingMessage>,
  routerRequest: RouterRequest,
  dir: string,
  serverAddr: Partial<ServerAddress>
) {
  const [resolveRoute, server] = await Promise.all([
    (resolveRouteMemo ??= getResolveRoute(dir, serverAddr)),
    createServer(),
  ])

  try {
    const {
      clientRequest,
      clientResponsePromise,
      serverRequest,
      serverResponse,
    } = await makeRequest(
      server,
      routerRequest.method,
      routerRequest.pathname,
      routerRequest.rawQuery,
      routerRequest.rawHeaders
    )

    // Send the clientRequest, so the server parses everything. We can then pass
    // the serverRequest to Next.js to handle.
    clientRequest.end()

    // The route promise must not block us from starting the client response
    // handling, so we cannot await it yet. By making the call, we allow
    // Next.js to start writing to the response whenever it's ready.
    const routePromise = resolveRoute(serverRequest, serverResponse)

    // Now that the Next.js has started processing the route, the
    // clientResponsePromise will resolve once they write data and then we can
    // begin streaming.
    // We again cannot block on the clientResponsePromise, because an error may
    // occur in the routePromise while we're waiting.
    const responsePromise = clientResponsePromise.then((c) =>
      handleClientResponse(ipc, c)
    )

    // Now that both promises are in progress, we await both so that a
    // rejection in either will end the routing.
    const [response] = await Promise.all([responsePromise, routePromise])

    server.close()
    return response
  } catch (e) {
    // Server doesn't need to be closed, because the sendError will terminate
    // the process.
    ipc.sendError(e as Error)
  }
}

async function handleClientResponse(
  ipc: Ipc<RouterRequest, IpcOutgoingMessage>,
  clientResponse: IncomingMessage
): Promise<MessageData | void> {
  if (clientResponse.headers['x-nextjs-route-result'] === '1') {
    clientResponse.setEncoding('utf8')
    // We're either a redirect or a rewrite
    let buffer = ''
    for await (const chunk of clientResponse) {
      buffer += chunk
    }

    const data = JSON.parse(buffer) as RouteResult

    switch (data.type) {
      case 'none':
        return {
          type: 'none',
        }
      case 'error':
        return {
          type: 'error',
          error: data.error,
        }
      case 'rewrite':
        return {
          type: 'rewrite',
          data: {
            url: data.url,
            headers: Object.entries(data.headers)
              .filter(([, val]) => val != null)
              .map(([name, value]) => [name, value!.toString()]),
          },
        }
      default:
        // @ts-expect-error data.type is never
        throw new Error(`unknown route result type: ${data.type}`)
    }
  }

  const responseHeaders: MiddlewareHeadersResponse = {
    statusCode: clientResponse.statusCode!,
    headers: toPairs(clientResponse.rawHeaders),
  }

  await ipc.send({
    type: 'value',
    data: JSON.stringify({
      type: 'middleware-headers',
      data: responseHeaders,
    }),
  })

  for await (const chunk of clientResponse) {
    await ipc.send({
      type: 'value',
      data: JSON.stringify({
        type: 'middleware-body',
        data: (chunk as Buffer).toJSON().data,
      }),
    })
  }
}
