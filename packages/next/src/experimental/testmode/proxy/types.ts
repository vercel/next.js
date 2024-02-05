export interface ProxyServer {
  readonly port: number
  fetchWith(
    input: string | URL,
    init?: RequestInit,
    testData?: string
  ): Promise<Response>
  close(): void
}

interface ProxyRequestBase {
  testData: string
  api: string
}

interface ProxyResponseBase {
  api: string
}

export interface ProxyUnhandledResponse extends ProxyResponseBase {
  api: 'unhandled'
}

export interface ProxyAbortResponse extends ProxyResponseBase {
  api: 'abort'
}

export interface ProxyContinueResponse extends ProxyResponseBase {
  api: 'continue'
}

export interface ProxyFetchRequest extends ProxyRequestBase {
  api: 'fetch'
  request: {
    url: string
    headers: Array<[string, string]>
    body: string | null
  } & Omit<RequestInit, 'headers' | 'body'>
}

export interface ProxyFetchResponse extends ProxyResponseBase {
  api: 'fetch'
  response: {
    status: number
    headers: Array<[string, string]>
    body: string | null
  }
}

export type ProxyRequest = ProxyFetchRequest

export type ProxyResponse =
  | ProxyUnhandledResponse
  | ProxyAbortResponse
  | ProxyContinueResponse
  | ProxyFetchResponse

export const ABORT: ProxyResponse = { api: 'abort' }
export const CONTINUE: ProxyResponse = { api: 'continue' }
export const UNHANDLED: ProxyResponse = { api: 'unhandled' }
