import type { IncomingMessage, ServerResponse } from 'http'
import type { ChildProcess } from 'child_process'

import httpProxy from 'next/dist/compiled/http-proxy'
import { Worker } from 'next/dist/compiled/jest-worker'
import { normalizeRepeatedSlashes } from '../../shared/lib/utils'

export const createServerHandler = async ({
  port,
  hostname,
  dir,
  dev = false,
  minimalMode,
}: {
  port: number
  hostname: string
  dir: string
  dev?: boolean
  minimalMode: boolean
}) => {
  const routerWorker = new Worker(require.resolve('./render-server'), {
    numWorkers: 1,
    maxRetries: 10,
    forkOptions: {
      env: {
        FORCE_COLOR: '1',
        ...process.env,
      },
    },
    exposedMethods: ['initialize'],
  }) as any as InstanceType<typeof Worker> & {
    initialize: typeof import('./render-server').initialize
  }

  let didInitialize = false

  for (const _worker of ((routerWorker as any)._workerPool?._workers || []) as {
    _child: ChildProcess
  }[]) {
    // eslint-disable-next-line no-loop-func
    _worker._child.on('exit', (code, signal) => {
      // catch failed initializing without retry
      if ((code || signal) && !didInitialize) {
        routerWorker?.end()
        process.exit(1)
      }
    })
  }

  const workerStdout = routerWorker.getStdout()
  const workerStderr = routerWorker.getStderr()

  workerStdout.on('data', (data) => {
    process.stdout.write(data)
  })
  workerStderr.on('data', (data) => {
    process.stderr.write(data)
  })

  const { port: routerPort } = await routerWorker.initialize({
    dir,
    port,
    dev,
    hostname,
    minimalMode,
    workerType: 'router',
    isNodeDebugging: false,
  })
  didInitialize = true

  const getProxyServer = (pathname: string) => {
    const targetUrl = `http://${hostname}:${routerPort}${pathname}`
    const proxyServer = httpProxy.createProxy({
      target: targetUrl,
      changeOrigin: false,
      ignorePath: true,
      xfwd: true,
      ws: true,
      followRedirects: false,
    })
    return proxyServer
  }

  // proxy to router worker
  return async (req: IncomingMessage, res: ServerResponse) => {
    const urlParts = (req.url || '').split('?')
    const urlNoQuery = urlParts[0]

    // this normalizes repeated slashes in the path e.g. hello//world ->
    // hello/world or backslashes to forward slashes, this does not
    // handle trailing slash as that is handled the same as a next.config.js
    // redirect
    if (urlNoQuery?.match(/(\\|\/\/)/)) {
      const cleanUrl = normalizeRepeatedSlashes(req.url!)
      res.statusCode = 308
      res.setHeader('Location', cleanUrl)
      res.end(cleanUrl)
      return
    }
    const proxyServer = getProxyServer(req.url || '/')
    proxyServer.web(req, res)
    proxyServer.on('error', (err) => {
      res.statusCode = 500
      res.end('Internal Server Error')
      console.error(err)
    })
  }
}
