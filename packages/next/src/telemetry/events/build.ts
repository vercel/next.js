import type { TelemetryPlugin } from '../../build/webpack/plugins/telemetry-plugin/telemetry-plugin'
import type { SWC_TARGET_TRIPLE } from '../../build/webpack/plugins/telemetry-plugin/telemetry-plugin'
import type { UseCacheTrackerKey } from '../../build/webpack/plugins/telemetry-plugin/use-cache-tracker-utils'
import { extractNextErrorCode } from '../../lib/error-telemetry-utils'

const REGEXP_DIRECTORY_DUNDER =
  /[\\/]__[^\\/]+(?<![\\/]__(?:tests|mocks))__[\\/]/i
const REGEXP_DIRECTORY_TESTS = /[\\/]__(tests|mocks)__[\\/]/i
const REGEXP_FILE_TEST = /\.(?:spec|test)\.[^.]+$/i

const EVENT_TYPE_CHECK_COMPLETED = 'NEXT_TYPE_CHECK_COMPLETED'
type EventTypeCheckCompleted = {
  durationInSeconds: number
  typescriptVersion: string | null
  inputFilesCount?: number
  totalFilesCount?: number
  incremental?: boolean
}

export function eventTypeCheckCompleted(event: EventTypeCheckCompleted): {
  eventName: string
  payload: EventTypeCheckCompleted
} {
  return {
    eventName: EVENT_TYPE_CHECK_COMPLETED,
    payload: event,
  }
}

const EVENT_LINT_CHECK_COMPLETED = 'NEXT_LINT_CHECK_COMPLETED'
export type EventLintCheckCompleted = {
  durationInSeconds: number
  eslintVersion: string | null
  lintedFilesCount?: number
  lintFix?: boolean
  buildLint?: boolean
  nextEslintPluginVersion?: string | null
  nextEslintPluginErrorsCount?: number
  nextEslintPluginWarningsCount?: number
  nextRulesEnabled: {
    [ruleName: `@next/next/${string}`]: 'off' | 'warn' | 'error'
  }
}

export function eventLintCheckCompleted(event: EventLintCheckCompleted): {
  eventName: string
  payload: EventLintCheckCompleted
} {
  return {
    eventName: EVENT_LINT_CHECK_COMPLETED,
    payload: event,
  }
}

const EVENT_BUILD_COMPLETED = 'NEXT_BUILD_COMPLETED'
type EventBuildCompleted = {
  bundler: 'webpack' | 'rspack' | 'turbopack'
  durationInSeconds: number
  totalPageCount: number
  hasDunderPages: boolean
  hasTestPages: boolean
  totalAppPagesCount?: number
}

export function eventBuildCompleted(
  pagePaths: string[],
  event: Omit<
    EventBuildCompleted,
    'totalPageCount' | 'hasDunderPages' | 'hasTestPages'
  >
): { eventName: string; payload: EventBuildCompleted } {
  return {
    eventName: EVENT_BUILD_COMPLETED,
    payload: {
      ...event,
      totalPageCount: pagePaths.length,
      hasDunderPages: pagePaths.some((path) =>
        REGEXP_DIRECTORY_DUNDER.test(path)
      ),
      hasTestPages: pagePaths.some(
        (path) =>
          REGEXP_DIRECTORY_TESTS.test(path) || REGEXP_FILE_TEST.test(path)
      ),
      totalAppPagesCount: event.totalAppPagesCount,
    },
  }
}

const EVENT_BUILD_FAILED = 'NEXT_BUILD_FAILED'
type EventBuildFailed = {
  bundler: 'webpack' | 'rspack' | 'turbopack'
  errorCode: string
  durationInSeconds: number
}

export function eventBuildFailed(event: EventBuildFailed) {
  return {
    eventName: EVENT_BUILD_FAILED,
    payload: event,
  }
}

const EVENT_BUILD_OPTIMIZED = 'NEXT_BUILD_OPTIMIZED'
type EventBuildOptimized = {
  durationInSeconds: number
  totalPageCount: number
  staticPageCount: number
  staticPropsPageCount: number
  serverPropsPageCount: number
  ssrPageCount: number
  hasDunderPages: boolean
  hasTestPages: boolean
  hasStatic404: boolean
  hasReportWebVitals: boolean
  headersCount: number
  rewritesCount: number
  redirectsCount: number
  headersWithHasCount: number
  rewritesWithHasCount: number
  redirectsWithHasCount: number
  middlewareCount: number
  isRspack: boolean
  totalAppPagesCount?: number
  staticAppPagesCount?: number
  serverAppPagesCount?: number
  edgeRuntimeAppCount?: number
  edgeRuntimePagesCount?: number
}

export function eventBuildOptimize(
  pagePaths: string[],
  event: Omit<
    EventBuildOptimized,
    'totalPageCount' | 'hasDunderPages' | 'hasTestPages' | 'isRspack'
  >
): { eventName: string; payload: EventBuildOptimized } {
  return {
    eventName: EVENT_BUILD_OPTIMIZED,
    payload: {
      ...event,
      totalPageCount: pagePaths.length,
      hasDunderPages: pagePaths.some((path) =>
        REGEXP_DIRECTORY_DUNDER.test(path)
      ),
      hasTestPages: pagePaths.some(
        (path) =>
          REGEXP_DIRECTORY_TESTS.test(path) || REGEXP_FILE_TEST.test(path)
      ),
      totalAppPagesCount: event.totalAppPagesCount,
      staticAppPagesCount: event.staticAppPagesCount,
      serverAppPagesCount: event.serverAppPagesCount,
      edgeRuntimeAppCount: event.edgeRuntimeAppCount,
      edgeRuntimePagesCount: event.edgeRuntimePagesCount,
      isRspack: process.env.NEXT_RSPACK !== undefined,
    },
  }
}

export const EVENT_BUILD_FEATURE_USAGE = 'NEXT_BUILD_FEATURE_USAGE'
export type EventBuildFeatureUsage = {
  // NOTE: If you are adding features, make sure to update the `enum` field
  // for `featureName` in https://github.com/vercel/next-telemetry/blob/master/events/v1/featureUsage.ts
  // *before* you make changes here.
  featureName:
    | 'next/image'
    | 'next/legacy/image'
    | 'next/future/image'
    | 'next/script'
    | 'next/dynamic'
    | '@next/font/google'
    | '@next/font/local'
    | 'next/font/google'
    | 'next/font/local'
    | 'experimental/nextScriptWorkers'
    | 'experimental/cacheComponents'
    | 'experimental/optimizeCss'
    | 'experimental/ppr'
    | 'experimental/isolatedDevBuild'
    | 'swcLoader'
    | 'swcRelay'
    | 'swcStyledComponents'
    | 'swcReactRemoveProperties'
    | 'swcExperimentalDecorators'
    | 'swcRemoveConsole'
    | 'swcImportSource'
    | 'swcEmotion'
    | `swc/target/${SWC_TARGET_TRIPLE}`
    | 'turbotrace'
    | 'vercelImageGeneration'
    | 'transpilePackages'
    | 'skipProxyUrlNormalize'
    | 'skipTrailingSlashRedirect'
    | 'modularizeImports'
    | 'esmExternals'
    | 'webpackPlugins'
    | UseCacheTrackerKey
    | 'turbopackFileSystemCache'
    | 'runAfterProductionCompile'
  invocationCount: number
}
export function eventBuildFeatureUsage(
  usages: ReturnType<TelemetryPlugin['usages']>
): Array<{ eventName: string; payload: EventBuildFeatureUsage }> {
  return usages.map(({ featureName, invocationCount }) => ({
    eventName: EVENT_BUILD_FEATURE_USAGE,
    payload: {
      featureName,
      invocationCount,
    },
  }))
}

export const EVENT_NAME_PACKAGE_USED_IN_GET_SERVER_SIDE_PROPS =
  'NEXT_PACKAGE_USED_IN_GET_SERVER_SIDE_PROPS'

export type EventPackageUsedInGetServerSideProps = {
  package: string
}

export function eventPackageUsedInGetServerSideProps(
  packagesUsedInServerSideProps: ReturnType<
    TelemetryPlugin['packagesUsedInServerSideProps']
  >
): Array<{ eventName: string; payload: EventPackageUsedInGetServerSideProps }> {
  return packagesUsedInServerSideProps.map((packageName) => ({
    eventName: EVENT_NAME_PACKAGE_USED_IN_GET_SERVER_SIDE_PROPS,
    payload: {
      package: packageName,
    },
  }))
}

export const EVENT_MCP_TOOL_USAGE = 'NEXT_MCP_TOOL_USAGE'

export type McpToolName =
  | 'mcp/get_errors'
  | 'mcp/get_logs'
  | 'mcp/get_page_metadata'
  | 'mcp/get_project_metadata'
  | 'mcp/get_server_action_by_id'

export type EventMcpToolUsage = {
  toolName: McpToolName
  invocationCount: number
}

export function eventMcpToolUsage(
  usages: Array<{ featureName: McpToolName; invocationCount: number }>
): Array<{ eventName: string; payload: EventMcpToolUsage }> {
  return usages.map(({ featureName, invocationCount }) => ({
    eventName: EVENT_MCP_TOOL_USAGE,
    payload: {
      toolName: featureName,
      invocationCount,
    },
  }))
}

export const ERROR_THROWN_EVENT = 'NEXT_ERROR_THROWN'
type ErrorThrownEvent = {
  eventName: typeof ERROR_THROWN_EVENT
  payload: {
    errorCode: string | undefined
    location: string | undefined
  }
}

// Creates a Telemetry event for errors. For privacy, only includes the error code and not the error
// message.
//
// `location` may be included if it's a location internal to the next.js source tree (i.e. a
// non-absolute path).
export function eventErrorThrown(
  error: Error,
  anonymizedLocation: string | undefined
): ErrorThrownEvent {
  return {
    eventName: ERROR_THROWN_EVENT,
    payload: {
      errorCode: extractNextErrorCode(error) || 'Unknown',
      location: anonymizedLocation,
    },
  }
}
