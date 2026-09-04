import type { AdapterOptions, EdgeHandler } from '../../server/web/adapter'
import '../adapter/setup-node-env.external'
import '../../server/web/globals'

import type { VariantsManifest } from '../../server/variants/manifest'

import { adapter } from '../../server/web/adapter'
import { SERVER_DIRECTORY, VARIANTS_MANIFEST } from '../../shared/lib/constants'
import { IncrementalCache } from '../../server/lib/incremental-cache'
declare const incrementalCacheHandler: any
// OPTIONAL_IMPORT:incrementalCacheHandler

// Import the userland code.
import * as _mod from 'VAR_USERLAND'
import { edgeInstrumentationOnRequestError } from '../../server/web/globals'
import { isNextRouterError } from '../../client/components/is-next-router-error'
import { toNodeOutgoingHttpHeaders } from '../../server/web/utils'
import type { RequestMeta } from '../../server/request-meta'

const mod = { ..._mod }

const page: string = 'VAR_DEFINITION_PAGE'
const isProxy = page === '/proxy' || page === '/src/proxy'
const handlerUserland = (isProxy ? mod.proxy : mod.middleware) || mod.default

class ProxyMissingExportError extends Error {
  constructor(message: string) {
    super(message)
    // Stack isn't useful here, remove it considering it spams logs during development.
    this.stack = ''
  }
}

// TODO: This spams logs during development. Find a better way to handle this.
// Removing this will spam "fn is not a function" logs which is worse.
if (typeof handlerUserland !== 'function') {
  throw new ProxyMissingExportError(
    `The ${isProxy ? 'Proxy' : 'Middleware'} file "${page}" must export a function named \`${isProxy ? 'proxy' : 'middleware'}\` or a default function.`
  )
}

// Proxy will only sent out the FetchEvent to next server,
// so load instrumentation module here and track the error inside proxy module.
function errorHandledHandler(fn: AdapterOptions['handler']) {
  return async (...args: Parameters<AdapterOptions['handler']>) => {
    try {
      return await fn(...args)
    } catch (err) {
      // In development, error the navigation API usage in runtime,
      // since it's not allowed to be used in proxy as it's outside of react component tree.
      if (process.env.NODE_ENV !== 'production') {
        if (isNextRouterError(err)) {
          err.message = `Next.js navigation API is not allowed to be used in ${isProxy ? 'Proxy' : 'Middleware'}.`
          throw err
        }
      }
      const req = args[0]
      const url = new URL(req.url)
      const resource = url.pathname + url.search
      await edgeInstrumentationOnRequestError(
        err,
        {
          path: resource,
          method: req.method,
          headers: Object.fromEntries(req.headers.entries()),
        },
        {
          routerKind: 'Pages Router',
          routePath: '/proxy',
          routeType: 'proxy',
          revalidateReason: undefined,
        }
      )

      throw err
    }
  }
}

const internalHandler: EdgeHandler = async (opts) => {
  let variantsManifest: VariantsManifest | undefined

  if (process.env.NEXT_RUNTIME !== 'edge') {
    // This mirrors what `RouteModule#prepare` does for routes
    // edge runtime handles loading instrumentation at the edge adapter level
    const { join, relative } =
      require('node:path') as typeof import('node:path')
    const { ensureInstrumentationRegistered } =
      require('../../server/lib/router-utils/instrumentation-globals.external') as typeof import('../../server/lib/router-utils/instrumentation-globals.external')
    const absoluteProjectDir = join(
      /* turbopackIgnore: true */
      process.cwd(),
      opts.request.requestMeta?.relativeProjectDir || ''
    )
    const absoluteDistDir = opts.request.requestMeta?.distDir
    const distDir = absoluteDistDir
      ? relative(absoluteProjectDir, absoluteDistDir)
      : '.next'

    await ensureInstrumentationRegistered(absoluteProjectDir, distDir)

    if (process.env.__NEXT_VARIANTS) {
      variantsManifest =
        loadVariantsManifest(join(absoluteProjectDir, distDir)) ?? undefined
    }
  }

  return adapter({
    ...opts,
    IncrementalCache,
    incrementalCacheHandler,
    page,
    variantsManifest,
    handler: errorHandledHandler(handlerUserland),
  })
}

// Keyed by `distDir`, because one process can serve more than one application
// and this module is read once per process.
const cachedVariantsManifests = new Map<string, VariantsManifest | null>()

/**
 * Reads the variants manifest from disk, and returns null when there is none.
 *
 * This branches on a compile-time condition with `if`/`else` rather than
 * returning early, so that an edge build removes the branch and with it a
 * `node:fs` require it could not resolve. An early return leaves the require in
 * the bundle.
 *
 * An absent file is the ordinary case, not an error: the build writes one
 * whenever the flag is on, so a missing file means the feature is off.
 *
 * The edge branch returns null rather than reading anything, and a variants
 * project never takes it. Variants need a Proxy file, which `build/entries.ts`
 * always compiles for Node, and `experimental.variants` together with a
 * `middleware.ts` is rejected by `getPagesPageStaticInfo`.
 */
function loadVariantsManifest(distDir: string): VariantsManifest | null {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    const cached = cachedVariantsManifests.get(distDir)

    if (cached !== undefined) {
      return cached
    }

    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    let manifest: VariantsManifest | null

    try {
      manifest = JSON.parse(
        readFileSync(join(distDir, SERVER_DIRECTORY, VARIANTS_MANIFEST), 'utf8')
      )
    } catch {
      manifest = null
    }

    cachedVariantsManifests.set(distDir, manifest)

    return manifest
  } else {
    return null
  }
}

export async function handler(
  request: Request,
  ctx: {
    waitUntil?: (prom: Promise<void>) => void
    signal?: AbortSignal
    requestMeta?: RequestMeta
  }
): Promise<Response> {
  const result = await internalHandler({
    request: {
      url: request.url,
      method: request.method,
      headers: toNodeOutgoingHttpHeaders(request.headers),
      nextConfig: {
        basePath: process.env.__NEXT_BASE_PATH,
        i18n: process.env.__NEXT_I18N_CONFIG as any,
        trailingSlash: Boolean(process.env.__NEXT_TRAILING_SLASH),
        experimental: {
          cacheLife: process.env.__NEXT_CACHE_LIFE as any,
          authInterrupts: Boolean(
            process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS
          ),
          clientParamParsingOrigins: process.env
            .__NEXT_CLIENT_PARAM_PARSING_ORIGINS as any,
        },
      },
      page: {
        name: page,
      },
      body:
        request.method !== 'GET' && request.method !== 'HEAD'
          ? (request.body ?? undefined)
          : undefined,
      waitUntil: ctx.waitUntil,
      requestMeta: ctx.requestMeta,
      signal: ctx.signal || new AbortController().signal,
    },
  })

  ctx.waitUntil?.(result.waitUntil)

  return result.response
}

// backwards compat for non-adapter setups
export default internalHandler
