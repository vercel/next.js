import { browserslistToTargets } from 'lightningcss'
import type { Targets } from 'lightningcss'
import type { ECacheKey } from './interface'

let targetsCache: Record<string, Targets> = {}
export const getTargets = (opts: { targets?: string[]; key: ECacheKey }) => {
  const cache = targetsCache[opts.key]
  if (cache) {
    return cache
  }

  const result = browserslistToTargets(opts.targets ?? [])
  return (targetsCache[opts.key] = result)
}
