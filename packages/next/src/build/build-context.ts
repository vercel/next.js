import type { LoadedEnvFiles } from '@next/env'
import type { Ora } from 'next/dist/compiled/ora'
import type { Rewrite, Redirect } from '../lib/load-custom-routes'
import type { __ApiPreviewProps } from '../server/api-utils'
import type { NextConfigComplete } from '../server/config-shared'
import type { Span } from '../trace'
import type getBaseWebpackConfig from './webpack-config'
import type { TelemetryPlugin } from './webpack/plugins/telemetry-plugin'

// a global object to store context for the current build
// this is used to pass data between different steps of the build without having
// to pass it through function arguments.
// Not exhaustive, but should be extended to as needed whilst refactoring
export const NextBuildContext: Partial<{
  // core fields
  dir: string
  buildId: string
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
  originalRedirects: Redirect[]
  loadedEnvFiles: LoadedEnvFiles
  previewProps: __ApiPreviewProps
  mappedPages:
    | {
        [page: string]: string
      }
    | undefined
  mappedAppPages:
    | {
        [page: string]: string
      }
    | undefined
  mappedRootPaths: {
    [page: string]: string
  }
  hasInstrumentationHook: boolean

  // misc fields
  telemetryPlugin: TelemetryPlugin
  buildSpinner: Ora
  nextBuildSpan: Span

  // cli fields
  reactProductionProfiling: boolean
  noMangling: boolean
  appDirOnly: boolean
  clientRouterFilters: Parameters<
    typeof getBaseWebpackConfig
  >[1]['clientRouterFilters']
}> = {}
