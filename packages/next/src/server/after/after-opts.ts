import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { RequestLifecycleOpts } from '../base-server'
import {
  getInternalNextRequestContext,
  type NextRequest,
} from '../web/spec-extension/request'

export type AfterOpts = Pick<RequestLifecycleOpts, 'waitUntil' | 'onClose'>

export function getAfterOptsFromNextRequest(request: NextRequest): AfterOpts {
  const ctx = getInternalNextRequestContext(request)
  return {
    waitUntil: ctx?.waitUntil,
    onClose: ctx?.onClose,
  }
}

export function getAfterOptsFromRequestResponsePair(
  req: BaseNextRequest,
  res: BaseNextResponse
): AfterOpts {
  const ctx = req.context
  return {
    waitUntil: ctx?.waitUntil,
    onClose: res.onClose.bind(res),
  }
}
