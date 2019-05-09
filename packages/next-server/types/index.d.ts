declare module 'react-ssr-prepass'

declare module '@zeit/fetch-retry' {
  import { Request, RequestInit, Response } from 'node-fetch'
  import { OperationOptions } from 'retry'

  interface Global {
    fetch: Fetch
  }

  export interface RequestRetryOptions extends RequestInit {
    retry?: OperationOptions & {
      onRetry(error: Error): void
    }
    onRetry?(error: Error, opts: RequestRetryOptions): void
  }

  export type Fetch = (
    url: string | Request,
    init?: RequestRetryOptions,
  ) => Promise<Response>

  export default function setup(fetch: Fetch): Fetch
}