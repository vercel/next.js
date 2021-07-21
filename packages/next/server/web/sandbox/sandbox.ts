import type { RequestData, FetchEventResult } from '../types'
import { Blob, File, FormData } from 'next/dist/compiled/formdata-node'
import { dirname } from 'path'
import { ReadableStream } from 'next/dist/compiled/web-streams-polyfill'
import { readFileSync } from 'fs'
import { TransformStream } from 'next/dist/compiled/web-streams-polyfill'
import * as polyfills from './polyfills'
import cookie from 'next/dist/compiled/cookie'
import vm from 'vm'

let cache:
  | {
      context: { [key: string]: any }
      paths: Map<string, string>
      require: Map<string, any>
      sandbox: vm.Context
    }
  | undefined

const WEBPACK_HASH_REGEX =
  /__webpack_require__\.h = function\(\) \{ return "[0-9a-f]+"; \}/g

/**
 * The cache is cleared when a path is cached and the content has changed. The
 * hack ignores changes than only change the compilation hash. Instead it is
 * probably better to disable HMR for middleware entries.
 */
export function clearSandboxCache(path: string, content: string) {
  const prev = cache?.paths.get(path)?.replace(WEBPACK_HASH_REGEX, '')
  if (prev === undefined) return
  if (prev === content.replace(WEBPACK_HASH_REGEX, '')) return
  cache = undefined
}

export async function run(params: {
  name: string
  paths: string[]
  request: RequestData
}): Promise<FetchEventResult> {
  if (cache === undefined) {
    const context: { [key: string]: any } = {
      _NEXT_ENTRIES: {},
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
      fetch,
      File,
      FormData,
      process: { env: { ...process.env } },
      ReadableStream,
      setInterval,
      setTimeout,
      TextDecoder: polyfills.TextDecoder,
      TextEncoder: polyfills.TextEncoder,
      TransformStream,
      URL,
      URLSearchParams,
    }

    cache = {
      context,
      require: new Map<string, any>([
        [require.resolve('next/dist/compiled/cookie'), { exports: cookie }],
      ]),
      paths: new Map<string, string>(),
      sandbox: vm.createContext({
        ...context,
        self: context,
      }),
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
  }

  for (const paramPath of params.paths) {
    if (!cache.paths.has(paramPath)) {
      const content = readFileSync(paramPath, 'utf-8')
      vm.runInNewContext(content, cache.sandbox, {
        filename: paramPath,
      })
      cache.paths.set(paramPath, content)
    }
  }

  const entryPoint = cache.context._NEXT_ENTRIES[`middleware_${params.name}`]
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
      ctx.self[map[mapKey]] = mod[mapKey]
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
