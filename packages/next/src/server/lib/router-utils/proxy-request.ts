import type { IncomingMessage, ServerResponse } from 'http'
import type { NextUrlWithParsedQuery } from '../../request-meta'

import url from 'url'
import { stringifyQuery } from '../../server-route-utils'
import { Duplex } from 'stream'
import { DetachedPromise } from '../../../lib/detached-promise'

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

  const target = url.format(parsedUrl)
  const HttpProxy =
    require('next/dist/compiled/http-proxy') as typeof import('next/dist/compiled/http-proxy')

  const proxy = new HttpProxy({
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

  // http-proxy does not properly detect a client disconnect in newer
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

  const detached = new DetachedPromise<boolean>()

  proxy.on('error', (err) => {
    console.error(`Failed to proxy ${target}`, err)
    if (!finished) {
      finished = true
      detached.reject(err)

      if (!res.destroyed) {
        if (!(res instanceof Duplex)) {
          res.statusCode = 500
        }

        res.end('Internal Server Error')
      }
    }
  })

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
    proxy.ws(req, res, upgradeHead)
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
    proxy.web(req, res, {
      buffer: reqBody,
    })
  }

  // When the proxy finishes proxying the request, shut down the proxy.
  return detached.promise.finally(() => {
    proxy.close()
  })
}
