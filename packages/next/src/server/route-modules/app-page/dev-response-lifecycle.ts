import type { BaseNextResponse } from '../../base-http'
import { isNodeNextResponse } from '../../base-http/helpers'
import { waitForResponseToFinish } from '../../app-render/wait-for-response'
import { signalFromNodeResponse } from '../../web/spec-extension/adapters/next-request'

/** Live response observations used only by development rendering. */
export type DevResponseLifecycle = {
  getCloseSignal(): AbortSignal
  waitForFinish(): Promise<boolean>
  isFinished(): boolean
}

/** Bind capabilities without observing the response or registering listeners yet. */
export function createDevResponseLifecycle(
  res: BaseNextResponse
): DevResponseLifecycle | undefined {
  if (!isNodeNextResponse(res)) {
    return undefined
  }

  return {
    getCloseSignal() {
      return signalFromNodeResponse(res.originalResponse)
    },
    waitForFinish() {
      return waitForResponseToFinish(res.originalResponse)
    },
    isFinished() {
      return res.originalResponse.writableFinished
    },
  }
}
