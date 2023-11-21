import type { Compilation } from 'next/dist/compiled/webpack/webpack'
import type { SyncHook, SyncBailHook, AsyncSeriesHook, HookMap } from 'tapable'
import type { Source } from 'webpack-sources'
import browserslist from 'browserslist'
import { browserslistToTargets } from 'lightningcss'
import type { Targets } from 'lightningcss/node/targets'
import { ECacheKey } from './interface'

type StatsPrinter = {
  hooks: {
    print: HookMap<SyncBailHook<any, string>>
  }
}

type Wp5Compilation = Compilation & {
  hooks: Compilation['hooks'] & {
    processAssets: AsyncSeriesHook<Record<string, Source>>
    statsPrinter: SyncHook<StatsPrinter>
  }
  constructor: {
    PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE: 400
  }
}

export const isWebpack5 = (
  compilation: Compilation
): compilation is Wp5Compilation => 'processAssets' in compilation.hooks

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
