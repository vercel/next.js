import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import type { SupportedErrorEvent } from './internal/container/Errors'
import type { ComponentStackFrame } from './internal/helpers/parse-component-stack'
import type {
  ACTION_STATIC_INDICATOR,
  ACTION_BUILD_OK,
  ACTION_BUILD_ERROR,
  ACTION_BEFORE_REFRESH,
  ACTION_REFRESH,
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
  ACTION_DEBUG_INFO,
  ACTION_VERSION_INFO,
} from './shared'
import type { Dispatcher as AppDispatcher } from './app/hot-reloader-client'
import type { VersionInfo } from '../../../server/dev/parse-version-info'

type StaticIndicatorAction = {
  type: typeof ACTION_STATIC_INDICATOR
  staticIndicator: boolean
}

type BuildOkAction = {
  type: typeof ACTION_BUILD_OK
}
type BuildErrorAction = {
  type: typeof ACTION_BUILD_ERROR
  message: string
}
type BeforeFastRefreshAction = {
  type: typeof ACTION_BEFORE_REFRESH
}
type FastRefreshAction = {
  type: typeof ACTION_REFRESH
}

type FastRefreshState =
  /** No refresh in progress. */
  | { type: 'idle' }
  /** The refresh process has been triggered, but the new code has not been executed yet. */
  | { type: 'pending'; errors: SupportedErrorEvent[] }

export type Dispatcher = (event: BusEvent) => void

export type DebugInfo = {
  devtoolsFrontendUrl: string | undefined
}

export type ErrorType = 'runtime' | 'build'

export type PagesDevOverlayProps = {
  children: React.ReactNode
  preventDisplay?: ErrorType[]
  globalOverlay?: boolean
}

export type AppDevOverlayProps = {
  state: OverlayState
  dispatcher?: AppDispatcher
  children: React.ReactNode
}

export type AppDevOverlayState = {
  isReactError: boolean
}

export type OverlayState = {
  nextId: number
  buildError: string | null
  errors: SupportedErrorEvent[]
  refreshState: FastRefreshState
  rootLayoutMissingTags: typeof window.__next_root_layout_missing_tags
  versionInfo: VersionInfo
  notFound: boolean
  staticIndicator: boolean
  debugInfo: DebugInfo | undefined
}

export type UnhandledErrorAction = {
  type: typeof ACTION_UNHANDLED_ERROR
  reason: Error
  frames: StackFrame[]
  componentStackFrames?: ComponentStackFrame[]
  warning?: [string, string, string]
}
export type UnhandledRejectionAction = {
  type: typeof ACTION_UNHANDLED_REJECTION
  reason: Error
  frames: StackFrame[]
}

export type DebugInfoAction = {
  type: typeof ACTION_DEBUG_INFO
  debugInfo: any
}

type VersionInfoAction = {
  type: typeof ACTION_VERSION_INFO
  versionInfo: VersionInfo
}

export type BusEvent =
  | BuildOkAction
  | BuildErrorAction
  | BeforeFastRefreshAction
  | FastRefreshAction
  | UnhandledErrorAction
  | UnhandledRejectionAction
  | VersionInfoAction
  | StaticIndicatorAction
  | DebugInfoAction
