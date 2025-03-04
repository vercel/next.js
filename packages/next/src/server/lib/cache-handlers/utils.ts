import type { ExperimentalConfig } from '../../config-shared'

export function findCacheHandlerByAlias(
  alias: string | undefined,
  cacheHandlers: NonNullable<ExperimentalConfig['cacheHandlers']>,
  iter?: (handler: string | undefined, visited: Set<string>) => boolean
) {
  if (alias) {
    const visited = new Set<string>()
    while (alias && alias in cacheHandlers) {
      alias = typeof alias === 'string' ? cacheHandlers[alias] : undefined
      if (typeof iter === 'function' && iter(alias, visited)) break
      if (alias) {
        if (visited.has(alias)) {
          throw new Error(
            `Circular cache handler dependency detected: ${alias}`
          )
        }
        visited.add(alias)
      }
    }
  }
  return alias
}
