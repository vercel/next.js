import { loader } from 'next/dist/compiled/webpack/webpack'
import { Span } from '../../../telemetry/trace'

export interface NextJsLoaderContext extends loader.LoaderContext {
  currentTraceSpan?: Span
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
}
