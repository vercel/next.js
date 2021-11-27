import type { Context } from 'vm'
import { dirname } from 'path'
import { readFileSync } from 'fs'
import { runInContext } from 'vm'

/**
 * Allows to require a series of dependencies provided by their path
 * into a provided module context. It fills and accepts a require
 * cache to ensure each module is loaded once.
 */
export function requireDependencies(params: {
  context: Context
  requireCache: Map<string, any>
  dependencies: {
    mapExports: { [key: string]: string }
    path: string
  }[]
}) {
  const { context, requireCache, dependencies } = params
  const requireFn = createRequire(context, requireCache)
  for (const { path, mapExports } of dependencies) {
    const mod = requireFn(path, path)
    for (const mapKey of Object.keys(mapExports)) {
      context[mapExports[mapKey]] = mod[mapKey]
    }
  }
}

function createRequire(context: Context, cache: Map<string, any>) {
  return function requireFn(referrer: string, specifier: string) {
    const resolved = require.resolve(specifier, {
      paths: [dirname(referrer)],
    })

    const cached = cache.get(resolved)
    if (cached !== undefined) {
      return cached.exports
    }

    const module = {
      exports: {},
      loaded: false,
      id: resolved,
    }

    cache.set(resolved, module)
    const fn = runInContext(
      `(function(module,exports,require,__dirname,__filename) {${readFileSync(
        resolved,
        'utf-8'
      )}\n})`,
      context
    )

    try {
      fn(
        module,
        module.exports,
        requireFn.bind(null, resolved),
        dirname(resolved),
        resolved
      )
    } finally {
      cache.delete(resolved)
    }
    module.loaded = true
    return module.exports
  }
}
