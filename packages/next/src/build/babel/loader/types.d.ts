import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { Span } from '../../../trace'

export interface NextJsLoaderContext extends webpack.LoaderContext<{}> {
  currentTraceSpan: Span
  target: string
}

export interface NextBabelLoaderOptions {
  hasJsxRuntime: boolean
  hasReactRefresh: boolean
  isServer: boolean
  development: boolean
  pagesDir: string
  sourceMaps?: any[]
  overrides: any
  caller: any
  configFile: string | undefined
  cwd: string
  srcDir: string
}
