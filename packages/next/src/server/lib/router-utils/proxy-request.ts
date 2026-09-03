import type { IncomingMessage, ServerResponse } from 'http'
import type { Socket } from 'net'
import type { NextUrlWithParsedQuery } from '../../request-meta'

import url from 'url'
import { stringifyQuery } from '../../server-route-utils'
import { Duplex } from 'stream'
import { createPromiseWithResolvers } from '../../../shared/lib/promise-with-resolvers'

// RFC 9110 §7.6.1: hop-by-hop fields are meaningful only for a single
// transport-level connection, so a proxy must not forward the fields a
// client's Connection header nominates: an upstream honoring the token list
// would silently strip them, and Next's own hop semantics must not be
// influenced by the client's tokens.
//
// `connection` and `transfer-encoding` are left byte-identical: Node's HTTP
// server re-reads `connection` after the handler to manage the client-facing
// connection, and without `transfer-encoding` httpxy cannot tell the request
// carries a streamed body — the unread body would linger on the client socket
// and be parsed as the next request (see the rewrite-request-smuggling
// suite). Nominated fields are deleted instead, so the tokens dangle
// harmlessly at the upstream.
const HOP_BY_HOP_HEADERS = new Set([
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
])

export function stripHopByHopRequestHeaders(req: IncomingMessage): void {
  for (const name of HOP_BY_HOP_HEADERS) {
    delete req.headers[name]
  }

  // Fields the Connection field nominates are hop-by-hop regardless of name.
  const connection = req.headers.connection
  if (typeof connection !== 'string') return
  for (const token of connection.split(',')) {
    const name = token.trim().toLowerCase()
    if (!name) continue
    // Framing tokens name connection-level semantics, not forwarded fields.
    if (name === 'close' || name === 'keep-alive') continue
    if (name === 'transfer-encoding') continue
    delete req.headers[name]
  }
}

export async function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse | Duplex,
  parsedUrl: NextUrlWithParsedQuery,
  upgradeHead?: Buffer,
  reqBody?: any,
  proxyTimeout?: number | null
) {
  const { query } = parsedUrl
  delete (parsedUrl as any).query
  parsedUrl.search = stringifyQuery(req as any, query)

  // Keep in mind that a WHATWG URL's hostname and the parsedUrl's hostname
  // are not strictly equal due to lowercasing, IDN translation, IPv4 and IPv6 normalization, etc.
  // We just make sure this is a valid URL since httpxy would only parse it
  // lazily on the `web()`/`ws()` call.
  const target = new URL(url.format(parsedUrl))
  const { ProxyServer } =
    require('next/dist/compiled/httpxy') as typeof import('next/dist/compiled/httpxy')

  stripHopByHopRequestHeaders(req)

  const proxy = new ProxyServer({
    target,
    changeOrigin: true,
    ignorePath: true,
    ws: true,
    // we limit proxy requests to 30s by default, in development
    // we don't time out WebSocket requests to allow proxying
    proxyTimeout: proxyTimeout === null ? undefined : proxyTimeout || 30_000,
    headers: {
      'x-forwarded-host': req.headers.host || '',
    },
  })

  let finished = false

  // httpxy does not properly detect a client disconnect in newer
  // versions of Node.js. This is caused because it only listens for the
  // `aborted` event on the our request object, but it also fully reads
  // and closes the request object. Node **will not** fire `aborted` when
  // the request is already closed. Listening for `close` on our response
  // object will detect the disconnect, and we can abort the proxy's
  // connection.
  proxy.on('proxyReq', (proxyReq) => {
    res.on('close', () => proxyReq.destroy())
  })

  proxy.on('proxyRes', (proxyRes) => {
    if (res.destroyed) {
      proxyRes.destroy()
    } else {
      res.on('close', () => proxyRes.destroy())
    }
  })

  proxy.on('proxyRes', (proxyRes, innerReq, innerRes) => {
    const cleanup = (err: any) => {
      // cleanup event listeners to allow clean garbage collection
      proxyRes.removeListener('error', cleanup)
      proxyRes.removeListener('close', cleanup)
      innerRes.removeListener('error', cleanup)
      innerRes.removeListener('close', cleanup)

      // destroy all source streams to propagate the caught event backward
      innerReq.destroy(err)
      proxyRes.destroy(err)
    }

    proxyRes.once('error', cleanup)
    proxyRes.once('close', cleanup)
    innerRes.once('error', cleanup)
    innerRes.once('close', cleanup)
  })

  const detached = createPromiseWithResolvers<boolean>()

  const onProxyError = (err: Error) => {
    if (!finished) {
      finished = true
      console.error(`Failed to proxy ${target}`, err)
      detached.reject(err)

      if (!res.destroyed) {
        if (!(res instanceof Duplex)) {
          res.statusCode = 500
        }

        res.end('Internal Server Error')
      }
    }
  }

  proxy.on('error', onProxyError)

  // If upgrade head is present or the response is a Duplex stream, treat as
  // WebSocket request.
  if (upgradeHead || res instanceof Duplex) {
    proxy.on('proxyReqWs', (proxyReq) => {
      proxyReq.on('close', () => {
        if (!finished) {
          finished = true
          detached.resolve(true)
        }
      })
    })
    // The returned promise rejects on errors of the client socket (e.g. an
    // abrupt client disconnect) even when an `error` listener is registered.
    proxy.ws(req, res as Socket, {}, upgradeHead).catch(onProxyError)
    detached.resolve(true)
  } else {
    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.on('close', () => {
        if (!finished) {
          finished = true
          detached.resolve(true)
        }
      })
    })
    // The returned promise rejects on errors of the client response stream
    // (e.g. an abrupt client disconnect) even when an `error` listener is
    // registered.
    proxy
      .web(req, res, {
        buffer: reqBody,
      })
      .catch(onProxyError)
  }

  // When the proxy finishes proxying the request, shut down the proxy.
  return detached.promise.finally(() => {
    proxy.close()
  })
}
