import { RequestAsyncStorageWrapper } from './async-storage/request-async-storage-wrapper'
import type { IncomingMessage, ServerResponse } from 'http'
import type { RequestAsyncStorage } from '../client/components/request-async-storage'
import type { RenderOpts } from './app-render'

type RunWithRequestAsyncStorageContext = {
  req: IncomingMessage
  res: ServerResponse
  renderOpts?: RenderOpts
}

export function runWithRequestAsyncStorage<Result>(
  requestAsyncStorage: RequestAsyncStorage,
  { req, res, renderOpts }: RunWithRequestAsyncStorageContext,
  callback: () => Promise<Result> | Result
): Promise<Result> | Result {
  return RequestAsyncStorageWrapper.wrap(
    requestAsyncStorage,
    { req, res, renderOpts },
    callback
  )
}
