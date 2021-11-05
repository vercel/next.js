import type { RequestData, FetchEventResult, NodeHeaders } from '../types'
import { Blob, File, FormData } from 'next/dist/compiled/formdata-node'
import { dirname } from 'path'
import { readFileSync } from 'fs'
import { TransformStream } from 'next/dist/compiled/web-streams-polyfill'
import * as polyfills from './polyfills'
import cookie from 'next/dist/compiled/cookie'
import vm from 'vm'

let cache:
  | {
      context: { [key: string]: any }
      onWarning: (warn: Error) => void
      paths: Map<string, string>
      require: Map<string, any>
      sandbox: vm.Context
      warnedEvals: Set<string>
    }
  | undefined

const WEBPACK_HASH_REGEX =
  /__webpack_require__\.h = function\(\) \{ return "[0-9a-f]+"; \}/g

/**
 * The cache is cleared when a path is cached and the content has changed. The
 * hack ignores changes than only change the compilation hash. Instead it is
 * probably better to disable HMR for middleware entries.
 */
export function clearSandboxCache(path: string, content: Buffer | string) {
  const prev = cache?.paths.get(path)?.replace(WEBPACK_HASH_REGEX, '')
  if (prev === undefined) return
  if (prev === content.toString().replace(WEBPACK_HASH_REGEX, '')) return
  cache = undefined
}

export async function run(params: {
  name: string
  onWarning: (warn: Error) => void
  paths: string[]
  request: RequestData
  ssr: boolean
}): Promise<FetchEventResult> {
  if (cache === undefined) {
    const context: { [key: string]: any } = {
      __next_eval__,
      _ENTRIES: {},
      atob: polyfills.atob,
      Blob,
      btoa: polyfills.btoa,
      clearInterval,
      clearTimeout,
      console: {
        assert: console.assert.bind(console),
        error: console.error.bind(console),
        info: console.info.bind(console),
        log: console.log.bind(console),
        time: console.time.bind(console),
        timeEnd: console.timeEnd.bind(console),
        timeLog: console.timeLog.bind(console),
        warn: console.warn.bind(console),
      },
      Crypto: polyfills.Crypto,
      crypto: new polyfills.Crypto(),
      fetch: (input: RequestInfo, init: RequestInit = {}) => {
        const url = getFetchURL(input, params.request.headers)
        init.headers = getFetchHeaders(params.name, init)
        if (isRequestLike(input)) {
          return fetch(url, {
            ...init,
            headers: {
              ...Object.fromEntries(input.headers),
              ...Object.fromEntries(init.headers),
            },
          })
        }
        return fetch(url, init)
      },
      File,
      FormData,
      process: { env: { ...process.env } },
      ReadableStream: polyfills.ReadableStream,
      setInterval,
      setTimeout,
      TextDecoder: polyfills.TextDecoder,
      TextEncoder: polyfills.TextEncoder,
      TransformStream,
      URL,
      URLSearchParams,
    }

    context.self = context
    context.globalThis = context

    cache = {
      context,
      onWarning: params.onWarning,
      paths: new Map<string, string>(),
      require: new Map<string, any>([
        [require.resolve('next/dist/compiled/cookie'), { exports: cookie }],
      ]),
      sandbox: vm.createContext(context, {
        codeGeneration:
          process.env.NODE_ENV === 'production'
            ? {
                strings: false,
                wasm: false,
              }
            : undefined,
      }),
      warnedEvals: new Set(),
    }

    loadDependencies(cache.sandbox, [
      {
        path: require.resolve('../spec-compliant/headers'),
        map: { Headers: 'Headers' },
      },
      {
        path: require.resolve('../spec-compliant/response'),
        map: { Response: 'Response' },
      },
      {
        path: require.resolve('../spec-compliant/request'),
        map: { Request: 'Request' },
      },
    ])
  } else {
    cache.onWarning = params.onWarning
  }

  for (const paramPath of params.paths) {
    if (!cache.paths.has(paramPath)) {
      const content = readFileSync(paramPath, 'utf-8')
      try {
        vm.runInNewContext(content, cache.sandbox, {
          filename: paramPath,
        })
        cache.paths.set(paramPath, content)
      } catch (error) {
        cache = undefined
        throw error
      }
    }
  }

  const entryPoint = cache.context._ENTRIES[`middleware_${params.name}`]

  if (params.ssr) {
    cache = undefined
    if (entryPoint) {
      return entryPoint.default({
        request: params.request,
      })
    }
  }

  return entryPoint.default({ request: params.request })
}

function loadDependencies(
  ctx: vm.Context,
  dependencies: { path: string; map: { [key: string]: string } }[]
) {
  for (const { path, map } of dependencies) {
    const mod = sandboxRequire(path, path)
    for (const mapKey of Object.keys(map)) {
      ctx[map[mapKey]] = mod[mapKey]
    }
  }
}

function sandboxRequire(referrer: string, specifier: string) {
  const resolved = require.resolve(specifier, {
    paths: [dirname(referrer)],
  })

  const cached = cache?.require.get(resolved)
  if (cached !== undefined) {
    return cached.exports
  }

  const module = {
    exports: {},
    loaded: false,
    id: resolved,
  }

  cache?.require.set(resolved, module)
  const fn = vm.runInContext(
    `(function(module,exports,require,__dirname,__filename) {${readFileSync(
      resolved,
      'utf-8'
    )}\n})`,
    cache!.sandbox
  )

  try {
    fn(
      module,
      module.exports,
      sandboxRequire.bind(null, resolved),
      dirname(resolved),
      resolved
    )
  } finally {
    cache?.require.delete(resolved)
  }
  module.loaded = true
  return module.exports
}

function getFetchHeaders(middleware: string, init: RequestInit) {
  const headers = new Headers(init.headers ?? {})
  const prevsub = headers.get(`x-middleware-subrequest`) || ''
  const value = prevsub.split(':').concat(middleware).join(':')
  headers.set(`x-middleware-subrequest`, value)
  headers.set(`user-agent`, `Next.js Middleware`)
  return headers
}

function getFetchURL(input: RequestInfo, headers: NodeHeaders = {}): string {
  const initurl = isRequestLike(input) ? input.url : input
  if (initurl.startsWith('/')) {
    const host = headers.host?.toString()
    const localhost =
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host?.startsWith('localhost:')
    return `${localhost ? 'http' : 'https'}://${host}${initurl}`
  }
  return initurl
}

function isRequestLike(obj: unknown): obj is Request {
  return Boolean(obj && typeof obj === 'object' && 'url' in obj)
}

function __next_eval__(fn: Function) {
  const key = fn.toString()
  if (!cache?.warnedEvals.has(key)) {
    const warning = new Error(
      `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware`
    )
    warning.name = 'DynamicCodeEvaluationWarning'
    Error.captureStackTrace(warning, __next_eval__)
    cache?.warnedEvals.add(key)
    cache?.onWarning(warning)
  }
  return fn()
}
