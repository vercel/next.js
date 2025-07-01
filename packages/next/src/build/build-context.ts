import type { LoadedEnvFiles } from '@next/env'
import type { Rewrite, Redirect } from '../lib/load-custom-routes'
import type { __ApiPreviewProps } from '../server/api-utils'
import type { NextConfigComplete } from '../server/config-shared'
import type { Span } from '../trace'
import type getBaseWebpackConfig from './webpack-config'
import type { TelemetryPluginState } from './webpack/plugins/telemetry-plugin/telemetry-plugin'
import type { Telemetry } from '../telemetry/storage'

// A layer for storing data that is used by plugins to communicate with each
// other between different steps of the build process. This is only internal
// to Next.js and will not be a part of the final build output.
// These states don't need to be deeply merged.
let pluginState: Record<string, any> = {}
export function resumePluginState(resumedState?: Record<string, any>) {
  Object.assign(pluginState, resumedState)
}

// This method gives you the plugin state with typed and mutable value fields
// behind a proxy so we can lazily initialize the values **after** resuming the
// plugin state.
export function getProxiedPluginState<State extends Record<string, any>>(
  initialState: State
) {
  return new Proxy(pluginState, {
    get(target, key: string) {
      if (typeof target[key] === 'undefined') {
        return (target[key] = initialState[key])
      }
      return target[key]
    },
    set(target, key: string, value) {
      target[key] = value
      return true
    },
  }) as State
}

export function getPluginState() {
  return pluginState
}

export interface MappedPages {
  [page: string]: string
}

// a global object to store context for the current build
// this is used to pass data between different steps of the build without having
// to pass it through function arguments.
// Not exhaustive, but should be extended to as needed whilst refactoring
export const NextBuildContext: Partial<{
  compilerIdx?: number
  pluginState: Record<string, any>
  // core fields
  dir: string
  distDir: string
  buildId: string
  encryptionKey: string
  config: NextConfigComplete
  appDir: string
  pagesDir: string
  rewrites: {
    fallback: Rewrite[]
    afterFiles: Rewrite[]
    beforeFiles: Rewrite[]
  }
  originalRewrites: {
    fallback: Rewrite[]
    afterFiles: Rewrite[]
    beforeFiles: Rewrite[]
  }
  hasRewrites: boolean
  originalRedirects: Redirect[]
  loadedEnvFiles: LoadedEnvFiles
  previewProps: __ApiPreviewProps
  mappedPages: MappedPages | undefined
  mappedAppPages: MappedPages | undefined
  mappedRootPaths: MappedPages
  hasInstrumentationHook: boolean

  // misc fields
  telemetry: Telemetry
  telemetryState: TelemetryPluginState
  nextBuildSpan: Span

  // cli fields
  reactProductionProfiling: boolean
  noMangling: boolean
  appDirOnly: boolean
  clientRouterFilters: Parameters<
    typeof getBaseWebpackConfig
  >[1]['clientRouterFilters']
  previewModeId: string
  fetchCacheKeyPrefix?: string
  allowedRevalidateHeaderKeys?: string[]
  isCompileMode?: boolean
  debugPrerender: boolean
}> = {}
