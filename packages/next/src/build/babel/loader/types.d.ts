import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { Span } from '../../../trace'

export interface NextJsLoaderContext extends webpack.LoaderContext<{}> {
  currentTraceSpan: Span
  target: string
}

export interface NextBabelLoaderBaseOptions {
  isServer: boolean
  distDir: string
  pagesDir: string
  cwd: string
  srcDir: string
  caller: any
  development: boolean

  // Custom plugins to be added to the generated babel options.
  reactCompilerPlugins?: Array<any>
  reactCompilerExclude?: (excludePath: string) => boolean
}

/**
 * Options to create babel loader for the default transformations.
 *
 * This is primary usecase of babel-loader configuration for running
 * all of the necessary transforms for the ecmascript instead of swc loader.
 */
export type NextBabelLoaderOptionDefaultPresets = NextBabelLoaderBaseOptions & {
  transformMode: 'default'
  hasJsxRuntime: boolean
  hasReactRefresh: boolean
  sourceMaps?: boolean | 'inline' | 'both' | null | undefined
  overrides: any
  configFile: string | undefined
}

/**
 * Options to create babel loader for 'standalone' transformations.
 *
 * This'll create a babel loader does not enable any of the default presets or plugins,
 * only the ones specified in the options where swc loader is enabled but need to inject
 * a babel specific plugins like react compiler.
 */
export type NextBabelLoaderOptionStandalone = NextBabelLoaderBaseOptions & {
  transformMode: 'standalone'
}

export type NextBabelLoaderOptions =
  | NextBabelLoaderOptionDefaultPresets
  | NextBabelLoaderOptionStandalone
