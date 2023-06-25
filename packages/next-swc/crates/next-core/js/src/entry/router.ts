import type { Ipc, StructuredError } from '@vercel/turbopack-node/ipc/index'
import type { IncomingMessage } from 'node:http'
import { Buffer } from 'node:buffer'
import { createServer, makeRequest, type ServerInfo } from '../internal/server'
import { toPairs } from '../internal/headers'
import { makeResolver } from 'next/dist/server/lib/route-resolver'
import loadConfig from 'next/dist/server/config'
import { PHASE_DEVELOPMENT_SERVER } from 'next/dist/shared/lib/constants'

import 'next/dist/server/node-polyfill-fetch.js'

import middlewareChunkGroup from 'MIDDLEWARE_CHUNK_GROUP'
import middlewareConfig from 'MIDDLEWARE_CONFIG'

type Resolver = Awaited<
  ReturnType<typeof import('next/dist/server/lib/route-resolver').makeResolver>
>

type RouterRequest = {
  method: string
  pathname: string
  rawHeaders: [string, string][]
  rawQuery: string
  body: number[][]
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

let resolveRouteMemo: Promise<Resolver>

async function getResolveRoute(
  dir: string,
  serverInfo: ServerInfo
): Promise<Resolver> {
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

  return await makeResolver(dir, nextConfig, middlewareCfg, serverInfo)
}

export default async function route(
  ipc: Ipc<RouterRequest, IpcOutgoingMessage>,
  routerRequest: RouterRequest,
  dir: string,
  serverInfo: ServerInfo
) {
  const [resolveRoute, server] = await Promise.all([
    (resolveRouteMemo ??= getResolveRoute(dir, serverInfo)),
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
      routerRequest.rawHeaders,
      serverInfo
    )

    const body = Buffer.concat(
      routerRequest.body.map((arr) => Buffer.from(arr))
    )

    // Send the clientRequest, so the server parses everything. We can then pass
    // the serverRequest to Next.js to handle.
    clientRequest.end(body)

    // The route promise must not block us from starting the middleware
    // response handling, so we cannot await it yet. By making the call, we
    // allow Next.js to start writing to the response whenever it's ready.
    const routePromise = resolveRoute(serverRequest, serverResponse)

    // Now that the Next.js has started processing the route, the middleware
    // response promise will resolve once they write data and then we can begin
    // streaming.
    // We again cannot await directly on the promise, because an error may
    // occur in the routePromise while we're waiting.
    const middlewarePromise = clientResponsePromise.then((c) =>
      handleMiddlewareResponse(ipc, c)
    )

    // Now that both promises are in progress, we await both so that a
    // rejection in either will end the routing.
    const [routeResult] = await Promise.all([routePromise, middlewarePromise])

    server.close()

    if (routeResult) {
      switch (routeResult.type) {
        case 'none':
        case 'error':
          return routeResult
        case 'rewrite':
          return {
            type: 'rewrite',
            data: {
              url: routeResult.url,
              headers: Object.entries(routeResult.headers)
                .filter(([, val]) => val != null)
                .map(([name, value]) => [name, value!.toString()]),
            },
          }
        default:
          // @ts-expect-error data.type is never
          throw new Error(`unknown route result type: ${data.type}`)
      }
    }
  } catch (e) {
    // Server doesn't need to be closed, because the sendError will terminate
    // the process.
    ipc.sendError(e as Error)
  }
}

async function handleMiddlewareResponse(
  ipc: Ipc<RouterRequest, IpcOutgoingMessage>,
  clientResponse: IncomingMessage
): Promise<void> {
  // If this header is specified, we know that the response was not handled by
  // middleware. The headers and body of the response are useless.
  if (clientResponse.headers['x-nextjs-route-result']) {
    return
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
