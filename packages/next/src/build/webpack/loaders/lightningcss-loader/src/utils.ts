import browserslist from 'next/dist/compiled/browserslist'
import { browserslistToTargets } from '../../../../swc/lightningcss/browserslistToTargets'
import type { Targets } from '../../../../swc/lightningcss/targets'
import type { ECacheKey } from './interface'

let targetsCache: Record<string, Targets> = {}
export const getTargets = (opts: {
  default?: string | string[]
  key: ECacheKey
}) => {
  const cache = targetsCache[opts.key]
  if (cache) {
    return cache
  }
  const cwd = process.cwd()
  const result = browserslist(opts.default, {
    path: cwd,
    env: process.env.NODE_ENV || 'production',
  })
  targetsCache[opts.key] = browserslistToTargets(result)
  return (targetsCache[opts.key] = browserslistToTargets(result))
}
