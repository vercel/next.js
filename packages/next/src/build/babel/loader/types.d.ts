import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { JSONValue } from '../../../server/config-shared'
import type { Span } from '../../../trace'

export interface NextJsLoaderContext extends webpack.LoaderContext<{}> {
  currentTraceSpan: Span
  target: string
}

export interface NextBabelLoaderBaseOptions {
  cwd: string

  /**
   * Should we read the user-provided custom babel config? Used in both `transformMode`s.
   */
  configFile?: string

  /**
   * Custom plugins to be added to the generated babel options.
   */
  reactCompilerPlugins?: Array<JSONValue>

  /**
   * Paths that the loader should not apply the react-compiler to.
   */
  reactCompilerExclude?: (excludePath: string) => boolean

  overrides?: any

  /**
   * Extra fields to pass to presets/plugins via the Babel 'caller' API.
   */
  caller?: any

  /**
   * Advanced: Can override webpack's sourcemap behavior (see `NextJsLoaderContext["sourceMap"]`).
   */
  sourceMaps?: boolean | 'inline' | 'both' | null | undefined
}

/**
 * Options to create babel loader for the default transformations.
 *
 * This is primary usecase of babel-loader configuration for running
 * all of the necessary transforms for the ecmascript instead of swc loader.
 */
export type NextBabelLoaderOptionDefaultPresets = NextBabelLoaderBaseOptions & {
  transformMode: 'default'

  isServer: boolean
  distDir: string
  pagesDir: string | undefined
  srcDir: string
  development: boolean
  hasJsxRuntime: boolean
  hasReactRefresh: boolean
}

/**
 * Options to create babel loader for 'standalone' transformations.
 *
 * This'll create a babel loader does not enable any of the default Next.js
 * presets or plugins that perform transformations. Non-transforming syntax
 * plugins (e.g. Typescript) will still be enabled.
 *
 * This is useful when Babel is used in combination with SWC, and we expect SWC
 * to perform downleveling and Next.js-specific transforms. Standalone mode is
 * used in Turbopack and when React Compiler is used with webpack.
 */
export type NextBabelLoaderOptionStandalone = NextBabelLoaderBaseOptions & {
  transformMode: 'standalone'
  isServer: boolean
}

export type NextBabelLoaderOptions =
  | NextBabelLoaderOptionDefaultPresets
  | NextBabelLoaderOptionStandalone
