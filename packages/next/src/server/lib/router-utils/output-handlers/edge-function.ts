import type { MiddlewareManifest } from '../../../../build/webpack/plugins/middleware-plugin'
import path from 'path'
import { MIDDLEWARE_MANIFEST } from '../../../../shared/lib/constants'
import type { HandleOutputCtx } from '../handle-output'
import { denormalizePagePath } from '../../../../shared/lib/page-path/denormalize-page-path'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import { DecodeError, PageNotFoundError } from '../../../../shared/lib/utils'
import { getRequestMeta } from '../../../request-meta'
import { urlQueryToSearchParams } from '../../../../shared/lib/router/utils/querystring'
import { signalFromNodeResponse } from '../../../web/spec-extension/adapters/next-request'
import { splitCookiesString } from '../../../web/utils'
import { pipeReadable } from '../../../pipe-readable'
import { getProperError } from '../../../../lib/is-error'

export function getEdgeFunctionInfo({
  middleware,
  distDir,
  page,
}: {
  middleware: boolean
  distDir: string
  page: string
}) {
  const manifest = require(path.join(
    distDir,
    'server',
    MIDDLEWARE_MANIFEST
  )) as MiddlewareManifest
  if (!manifest) {
    return null
  }

  let foundPage: string

  try {
    foundPage = denormalizePagePath(normalizePagePath(page))
  } catch (err) {
    return null
  }

  let pageInfo = middleware
    ? manifest.middleware[foundPage]
    : manifest.functions[foundPage]

  if (!pageInfo) {
    if (!middleware) {
      throw new PageNotFoundError(foundPage)
    }
    return null
  }

  return {
    name: pageInfo.name,
    paths: pageInfo.files.map((file) => path.join(distDir, file)),
    wasm: (pageInfo.wasm ?? []).map((binding) => ({
      ...binding,
      filePath: path.join(distDir, binding.filePath),
    })),
    assets: (pageInfo.assets ?? []).map((binding) => {
      return {
        ...binding,
        filePath: path.join(distDir, binding.filePath),
      }
    }),
  }
}

export async function handleEdgeFunction(ctx: HandleOutputCtx) {
  const { dev, req, res, nextConfig, output, parsedUrl, distDir, ipcMethods } =
    ctx

  try {
    let edgeInfo: ReturnType<typeof getEdgeFunctionInfo> | undefined

    const query = parsedUrl.query
    const page = output.itemPath

    edgeInfo = getEdgeFunctionInfo({
      page,
      distDir,
      middleware: false,
    })

    if (!edgeInfo) {
      return null
    }

    // For edge to "fetch" we must always provide an absolute URL
    const isDataReq = !!query.__nextDataReq
    const initialUrl = new URL(
      getRequestMeta(req, '__NEXT_INIT_URL') || '/',
      'http://n'
    )
    const queryString = urlQueryToSearchParams({
      ...Object.fromEntries(initialUrl.searchParams),
      ...query,
    }).toString()

    if (isDataReq) {
      req.headers['x-nextjs-data'] = '1'
    }
    initialUrl.search = queryString
    const url = initialUrl.toString()

    if (!url.startsWith('http')) {
      throw new Error(
        'To use middleware you must provide a `hostname` and `port` to the Next.js Server'
      )
    }

    const { run } =
      require('../../../web/sandbox') as typeof import('../../../web/sandbox')

    const result = await run({
      distDir,
      name: edgeInfo.name,
      paths: edgeInfo.paths,
      edgeFunctionEntry: edgeInfo,
      request: {
        headers: req.headers,
        method: req.method || 'GET',
        nextConfig: {
          basePath: nextConfig.basePath,
          i18n: nextConfig.i18n,
          trailingSlash: nextConfig.trailingSlash,
        },
        url,
        page: {
          name: page,
        },
        body: getRequestMeta(req, '__NEXT_CLONABLE_BODY'),
        signal: signalFromNodeResponse(res),
      },
      useCache: true,
      onWarning: (warn: any) =>
        dev ? ipcMethods.logErrorWithOriginalStack(warn, 'warning') : null,
      incrementalCache:
        (globalThis as any).__incrementalCache ||
        getRequestMeta(req, '_nextIncrementalCache'),
    })

    if (!res.statusCode || res.statusCode < 400) {
      res.statusCode = result.response.status
      res.statusMessage = result.response.statusText
    }

    result.response.headers.forEach((value, key) => {
      // The append handling is special cased for `set-cookie`.
      if (key.toLowerCase() === 'set-cookie') {
        for (const cookie of splitCookiesString(value)) {
          res.appendHeader(key, cookie)
        }
      } else {
        res.appendHeader(key, value)
      }
    })

    if (result.response.body) {
      await pipeReadable(result.response.body, res)
    } else {
      res.end()
    }

    return result
  } catch (error) {
    if (error instanceof DecodeError) {
      throw error
    }
    ipcMethods.logErrorWithOriginalStack(error, 'warning')
    const err = getProperError(error)
    throw err
  }
}
