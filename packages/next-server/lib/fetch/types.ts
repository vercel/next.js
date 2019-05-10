import {
  Body as NodeBody,
  Headers as NodeHeaders,
  Response as NodeResponse,
  Request as NodeRequest,
  RequestInit as NodeRequestInit,
} from 'node-fetch'

export type IsomorphicHeaders = Headers | NodeHeaders
export type IsomorphicBody = Body | NodeBody
export type IsomorphicResponse = Response | NodeResponse
export type IsomorphicRequest = Request | NodeRequest
export type IsomorphicRequestInit = RequestInit | NodeRequestInit

export type RetryOptions = {
  retries?: number
  factor?: number
  minTimeout?: number,
}

export type Fetch = (
  url: string | IsomorphicRequest,
  init?: IsomorphicRequestInit & { retry?: RetryOptions },
) => Promise<IsomorphicResponse>
