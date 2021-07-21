import type { EdgeRequest } from './request'
import type { EdgeResponse } from './response'
import type { ParsedNextUrl } from '../../shared/lib/router/utils/parse-next-url'

export interface EdgeFunction {
  (params: {
    request: RequestData
    response: ResponseData
    runtime?: { [key: string]: any }
  }): Promise<EdgeFunctionResult>
}

export interface RequestData {
  geo?: { city?: string; country?: string; region?: string }
  headers: Headers
  ip?: string
  method: string
  url: ParsedNextUrl
}

export interface ResponseData {
  headers?: Headers
}

export interface RequestHandler {
  (req: EdgeRequest, res: EdgeResponse, next?: () => void): Promise<void>
}

export interface EdgeFunctionResult {
  event: HeadersEvent
  promise: Promise<void>
  response: EdgeResponse
}

export type HeadersEvent = 'streaming' | 'data' | 'next'
