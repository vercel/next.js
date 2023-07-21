import type { IncomingMessage, ServerResponse } from 'http'
import type { NextUrlWithParsedQuery } from '../../request-meta'

import url from 'url'
import { stringifyQuery } from '../../server-route-utils'

export async function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: NextUrlWithParsedQuery,
  upgradeHead?: any,
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
    xfwd: true,
    ws: true,
    // we limit proxy requests to 30s by default, in development
    // we don't time out WebSocket requests to allow proxying
    proxyTimeout: proxyTimeout === null ? undefined : proxyTimeout || 30_000,
  })

  await new Promise((proxyResolve, proxyReject) => {
    let finished = false

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

    proxy.on('error', (err) => {
      console.error(`Failed to proxy ${target}`, err)
      if (!finished) {
        finished = true
        proxyReject(err)

        if (!res.destroyed) {
          res.statusCode = 500
          res.end('Internal Server Error')
        }
      }
    })

    // if upgrade head is present treat as WebSocket request
    if (upgradeHead) {
      proxy.on('proxyReqWs', (proxyReq) => {
        proxyReq.on('close', () => {
          if (!finished) {
            finished = true
            proxyResolve(true)
          }
        })
      })
      proxy.ws(req as any as IncomingMessage, res, upgradeHead)
      proxyResolve(true)
    } else {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.on('close', () => {
          if (!finished) {
            finished = true
            proxyResolve(true)
          }
        })
      })
      proxy.web(req, res, {
        buffer: reqBody,
      })
    }
  })
}
