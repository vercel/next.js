import type { EdgeFunctionRequest, EdgeFunctionResult } from '../types'
import { Blob, File } from 'next/dist/compiled/@javivelasco/formdata-node'
import { dirname } from 'path'
import { FormData } from 'next/dist/compiled/@javivelasco/formdata-node'
import { ReadableStream } from 'next/dist/compiled/web-streams-polyfill'
import { readFileSync } from 'fs'
import { TransformStream } from 'next/dist/compiled/web-streams-polyfill'
import * as polyfills from './polyfills'
import accept from '@hapi/accept'
import cookie from 'next/dist/compiled/cookie'
import vm from 'vm'

let cache:
  | {
      context: { [key: string]: any }
      paths: Set<string>
      sandbox: vm.Context
    }
  | undefined

export function clearSandboxCache(path: string) {
  if (cache === undefined) return
  if (!cache.paths.has(path)) return
  cache = undefined
}

export async function run(params: {
  name: string
  paths: string[]
  request: EdgeFunctionRequest
}): Promise<EdgeFunctionResult> {
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
      sandbox: vm.createContext({
        ...context,
        self: context,
      }),
      paths: new Set<string>(),
    }

    loadDependencies(cache.sandbox, [
      {
        path: require.resolve('../spec-compliant/headers'),
        map: { Headers: 'Headers' },
      },
      {
        path: require.resolve('../spec-compliant/response'),
        map: { Response: 'WhatWGResponse' },
      },
      {
        path: require.resolve('../spec-compliant/request'),
        map: { Request: 'WhatWGRequest' },
      },
      {
        path: require.resolve('../spec-extension/response'),
        map: { Response: 'Response' },
      },
      {
        path: require.resolve('../spec-extension/request'),
        map: { Request: 'Request' },
      },
    ])
  }

  for (const paramPath of params.paths) {
    if (!cache.paths.has(paramPath)) {
      vm.runInNewContext(readFileSync(paramPath, 'utf-8'), cache.sandbox, {
        filename: paramPath,
      })
      cache.paths.add(paramPath)
    }
  }

  const entryPoint = cache.context._NEXT_ENTRIES[`edge_${params.name}`]
  return entryPoint.edgeFunction({ request: params.request })
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

const requireCache = new Map<string, any>([
  [require.resolve('@hapi/accept'), { exports: accept }],
  [require.resolve('next/dist/compiled/cookie'), { exports: cookie }],
])

function sandboxRequire(referrer: string, specifier: string) {
  const resolved = require.resolve(specifier, {
    paths: [dirname(referrer)],
  })

  const cached = requireCache.get(resolved)
  if (cached !== undefined) {
    return cached.exports
  }

  const module = {
    exports: {},
    loaded: false,
    id: resolved,
  }

  requireCache.set(resolved, module)
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
    requireCache.delete(resolved)
  }
  module.loaded = true
  return module.exports
}
