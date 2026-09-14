import {
  getSerializedOverlayState,
  subscribeToRuntimeErrorState,
} from 'next/dist/compiled/next-devtools'
import type { SerializedRuntimeErrorState } from '../../../next-devtools/dev-overlay.browser'
import {
  HMR_MESSAGE_SENT_TO_SERVER,
  type RuntimeErrorStateUpdate,
} from '../../../server/dev/hot-reloader-types'

let reportCurrentState: (() => void) | undefined

export function reportCurrentRuntimeErrorState(): void {
  reportCurrentState?.()
}

export function createRuntimeErrorStateReporter(
  sendMessage: (message: string) => void
) {
  let lastSerializedState: string | null = null

  const report = (errorState: SerializedRuntimeErrorState, force = false) => {
    const pathname = window.location.pathname
    const serializedState = JSON.stringify({ pathname, errorState })
    if (!force && serializedState === lastSerializedState) {
      return
    }
    lastSerializedState = serializedState

    const update: RuntimeErrorStateUpdate = {
      event: HMR_MESSAGE_SENT_TO_SERVER.RUNTIME_ERRORS,
      pathname,
      errorState,
    }
    sendMessage(JSON.stringify(update))
  }

  subscribeToRuntimeErrorState((state: SerializedRuntimeErrorState) =>
    report(state)
  )

  const reportCurrent = (force: boolean) => {
    const state = getSerializedOverlayState()
    if (state) {
      report({ errors: state.errors, routerType: state.routerType }, force)
    }
  }
  reportCurrentState = () => reportCurrent(false)

  return {
    reportCurrent(): void {
      reportCurrent(true)
    },
  }
}
