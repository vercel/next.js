import { browserslistToTargets } from '../../../../swc/lightningcss/browserslistToTargets'
import type { Targets } from '../../../../swc/lightningcss/targets'
import type { ECacheKey } from './interface'

let targetsCache: Record<string, Targets> = {}
export const getTargets = (opts: { targets: string[]; key: ECacheKey }) => {
  const cache = targetsCache[opts.key]
  if (cache) {
    return cache
  }

  return (targetsCache[opts.key] = browserslistToTargets(opts.targets))
}
