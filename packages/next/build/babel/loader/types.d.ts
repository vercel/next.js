import { loader } from 'next/dist/compiled/webpack/webpack'
import { Span } from '../../../telemetry/trace'
import { InjectModulePluginContext } from '../../webpack/plugins/inject-module-plugin'

export interface NextJsLoaderContext extends loader.LoaderContext {
  currentTraceSpan: Span
  _injectModulePlugin: InjectModulePluginContext
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
