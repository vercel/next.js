import nodeFetch, { Response, Request, RequestInit } from 'node-fetch'
import setupFetch from './fetch-node'
import setupRetry, { RetryOptions } from './retry'

export type RequestRetryOptions = {
  retry?: RetryOptions & {
    onRetry(error: Error): void,
  }
  onRetry?(error: Error, opts: RequestRetryOptions): void,
}

export type Fetch = (
  url: string | Request,
  init?: RequestInit & RequestRetryOptions,
) => Promise<Response>

// node-fetch types are not compatible with dom types
const fetchRetry = setupRetry(nodeFetch as any) as any
const fetch = setupFetch(fetchRetry) as Fetch

export default fetch
