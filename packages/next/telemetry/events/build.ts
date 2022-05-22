import { TelemetryPlugin } from '../../build/webpack/plugins/telemetry-plugin'
import type { SWC_TARGET_TRIPLE } from '../../build/webpack/plugins/telemetry-plugin'

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
  durationInSeconds: number
  totalPageCount: number
  hasDunderPages: boolean
  hasTestPages: boolean
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
    },
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
}

export function eventBuildOptimize(
  pagePaths: string[],
  event: Omit<
    EventBuildOptimized,
    'totalPageCount' | 'hasDunderPages' | 'hasTestPages'
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
    | 'next/script'
    | 'next/dynamic'
    | 'experimental/optimizeCss'
    | 'experimental/nextScriptWorkers'
    | 'optimizeFonts'
    | 'swcLoader'
    | 'swcMinify'
    | 'swcRelay'
    | 'swcStyledComponents'
    | 'swcReactRemoveProperties'
    | 'swcExperimentalDecorators'
    | 'swcRemoveConsole'
    | 'swcImportSource'
    | 'swcEmotion'
    | `swc/target/${SWC_TARGET_TRIPLE}`
    | 'build-lint'
  invocationCount: number
}
export function eventBuildFeatureUsage(
  telemetryPlugin: TelemetryPlugin
): Array<{ eventName: string; payload: EventBuildFeatureUsage }> {
  return telemetryPlugin.usages().map(({ featureName, invocationCount }) => ({
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
  telemetryPlugin: TelemetryPlugin
): Array<{ eventName: string; payload: EventPackageUsedInGetServerSideProps }> {
  return telemetryPlugin.packagesUsedInServerSideProps().map((packageName) => ({
    eventName: EVENT_NAME_PACKAGE_USED_IN_GET_SERVER_SIDE_PROPS,
    payload: {
      package: packageName,
    },
  }))
}
