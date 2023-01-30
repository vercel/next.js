import { RequestAsyncStorageWrapper } from './async-storage/request-async-storage-wrapper'
import type { IncomingMessage, ServerResponse } from 'http'
import type { RequestAsyncStorage } from '../client/components/request-async-storage'
import type { RenderOpts } from './app-render'

type RunWithRequestAsyncStorageContext = {
  req: IncomingMessage
  res: ServerResponse
  renderOpts?: RenderOpts
}

const wrapper = new RequestAsyncStorageWrapper()

export function runWithRequestAsyncStorage<Result>(
  requestAsyncStorage: RequestAsyncStorage,
  { req, res, renderOpts }: RunWithRequestAsyncStorageContext,
  callback: () => Promise<Result> | Result
): Promise<Result> | Result {
  return wrapper.wrap(requestAsyncStorage, { req, res, renderOpts }, callback)
}
