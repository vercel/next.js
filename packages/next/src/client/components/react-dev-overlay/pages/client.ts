import * as Bus from './bus'
import {
  ACTION_BEFORE_REFRESH,
  ACTION_BUILD_ERROR,
  ACTION_BUILD_OK,
  ACTION_DEV_INDICATOR,
  ACTION_REFRESH,
  ACTION_STATIC_INDICATOR,
  ACTION_VERSION_INFO,
} from '../shared'
import type { VersionInfo } from '../../../../server/dev/parse-version-info'
import type { DevIndicatorServerState } from '../../../../server/dev/dev-indicator-server-state'
import { handleGlobalErrors } from '../../errors/use-error-handler'
import { patchConsoleError } from '../../globals/intercept-console-error'

let isRegistered = false

export function register() {
  if (isRegistered) {
    return
  }
  isRegistered = true

  try {
    Error.stackTraceLimit = 50
  } catch {}

  handleGlobalErrors()
  patchConsoleError()
}

export function onBuildOk() {
  Bus.emit({ type: ACTION_BUILD_OK })
}

export function onBuildError(message: string) {
  Bus.emit({ type: ACTION_BUILD_ERROR, message })
}

export function onRefresh() {
  Bus.emit({ type: ACTION_REFRESH })
}

export function onBeforeRefresh() {
  Bus.emit({ type: ACTION_BEFORE_REFRESH })
}

export function onVersionInfo(versionInfo: VersionInfo) {
  Bus.emit({ type: ACTION_VERSION_INFO, versionInfo })
}

export function onStaticIndicator(isStatic: boolean) {
  Bus.emit({ type: ACTION_STATIC_INDICATOR, staticIndicator: isStatic })
}

export function onDevIndicator(devIndicatorsState: DevIndicatorServerState) {
  Bus.emit({ type: ACTION_DEV_INDICATOR, devIndicator: devIndicatorsState })
}

export { getErrorByType } from '../utils/get-error-by-type'
export { getServerError } from '../utils/node-stack-frames'
