// this must come first as it includes require hooks
import { initializeServerWorker } from './setup-server-worker'

import fs from 'fs'
import url from 'url'
import loadConfig from '../config'
import { Redirect } from '../../../types'
import { addRequestMeta } from '../request-meta'
import { Header } from '../../lib/load-custom-routes'
import { IncomingMessage, ServerResponse } from 'http'
import { stringifyQuery } from '../server-route-utils'
import { getRedirectStatus } from '../../lib/redirect-status'
import { normalizeRepeatedSlashes } from '../../shared/lib/utils'
import { FsOutput, setupFsCheck } from './router-utils/filesystem'
import { getPathMatch } from '../../shared/lib/router/utils/path-match'

import {
  matchHas,
  prepareDestination,
} from '../../shared/lib/router/utils/prepare-destination'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_SERVER,
} from '../../shared/lib/constants'

let result:
  | undefined
  | {
      port: number
      hostname: string
    }

export async function initialize(opts: {
  dir: string
  port: number
  dev: boolean
  minimalMode?: boolean
  hostname?: string
  workerType: 'router' | 'render'
  isNodeDebugging: boolean
  keepAliveTimeout?: number
}): Promise<NonNullable<typeof result>> {
  if (result) {
    return result
  }
  const config = await loadConfig(
    opts.dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER,
    opts.dir
  )

  const fsChecker = await setupFsCheck({
    dev: opts.dev,
    dir: opts.dir,
    config,
  })

  async function resolveRoutes(req: IncomingMessage, res: ServerResponse) {
    const routes: ({
      match: ReturnType<typeof getPathMatch>
      check?: boolean
      name?: string
    } & Partial<Header> &
      Partial<Redirect>)[] = [
      ...fsChecker.headers,
      ...fsChecker.redirects,

      // check middleware (using matchers)

      ...fsChecker.rewrites.beforeFiles,

      // we check exact matches on fs before continuing to
      // after files rewrites
      { match: () => ({} as any), name: 'check_fs' },

      ...fsChecker.rewrites.afterFiles,

      // we always do the check: true handling before continuing to
      // fallback rewrites
      {
        check: true,
        match: () => ({} as any),
        name: 'after files check: true',
      },

      // check fs and dynamic routes (check: true)

      ...fsChecker.rewrites.fallback,
    ]

    let finished = false
    let matchedOutput: FsOutput | null = null
    const parsedUrl = url.parse(req.url || '', true)

    addRequestMeta(req, '__NEXT_INIT_QUERY', { ...parsedUrl.query })

    for (const route of routes) {
      let params = route.match(parsedUrl.pathname)

      if ((route.has || route.missing) && params) {
        const hasParams = matchHas(
          req,
          parsedUrl.query,
          route.has,
          route.missing
        )
        if (hasParams) {
          Object.assign(params, hasParams)
        } else {
          params = false
        }
      }

      if (params) {
        if (route.name === 'check_fs') {
          const output = await fsChecker.getItem(parsedUrl.pathname || '')

          if (output) {
            finished = true
            matchedOutput = output
          }
          break
        }

        // handle redirect
        if (
          ('statusCode' in route || 'permanent' in route) &&
          route.destination
        ) {
          const { parsedDestination } = prepareDestination({
            appendParamsToQuery: false,
            destination: route.destination,
            params: params,
            query: parsedUrl.query,
          })

          const { query } = parsedDestination
          delete (parsedDestination as any).query

          parsedDestination.search = stringifyQuery(req as any, query)

          let updatedDestination = url.format(parsedDestination)

          if (updatedDestination.startsWith('/')) {
            updatedDestination = normalizeRepeatedSlashes(updatedDestination)
          }

          res.setHeader('Location', updatedDestination)
          res.statusCode = getRedirectStatus(route)
          res.end(updatedDestination)
          finished = true
          break
        }
      }
    }

    return {
      finished,
      parsedUrl,
      matchedOutput,
    }
  }

  const requestHandler: Parameters<typeof initializeServerWorker>[0] = async (
    req,
    res
  ) => {
    try {
      const routeResult = await resolveRoutes(req, res)
      console.log('requestHandler!', req.url, result)

      if (routeResult.matchedOutput) {
        if (routeResult.matchedOutput.fsPath) {
          return fs
            .createReadStream(routeResult.matchedOutput.fsPath)
            .pipe(res)
            .on('close', () => res.end())
            .on('error', (err) => {
              console.error(err)
              res.end()
            })
        } else {
          // proxy to the related render worker
          return res.end(`matched output! ${routeResult.matchedOutput.type}`)
        }
      }

      // proxy rewrite
      if (routeResult.finished && routeResult.parsedUrl.protocol) {
        return res.end('external rewrite')
      }

      // invoke related render worker for 404
      res.statusCode = 404
      res.end('404 - not found')
    } catch (err) {
      console.error(err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }

  const upgradeHandler: Parameters<typeof initializeServerWorker>[1] = async (
    req,
    socket,
    head
  ) => {
    console.log('upgradeHandler!', req.url)
    socket.end()
  }

  const { port, hostname } = await initializeServerWorker(
    requestHandler,
    upgradeHandler,
    opts
  )

  result = {
    port,
    hostname: hostname === '0.0.0.0' ? '127.0.0.1' : hostname,
  }
  return result
}
