import type { I18NConfig } from '../config-shared'
import type { NextRequest } from '../web/spec-extension/request'
import type { NextFetchEvent } from '../web/spec-extension/fetch-event'
import type { NextResponse } from './spec-extension/response'
import type { CloneableBody } from '../body-streams'

export interface NodeHeaders {
  [header: string]: string | string[] | undefined
}

export interface RequestData {
  geo?: {
    city?: string
    country?: string
    region?: string
    latitude?: string
    longitude?: string
  }
  headers: NodeHeaders
  ip?: string
  method: string
  nextConfig?: {
    basePath?: string
    i18n?: I18NConfig | null
    trailingSlash?: boolean
  }
  page?: {
    name?: string
    params?: { [key: string]: string }
  }
  url: string
  body?: ReadableStream<Uint8Array>
}

export type NodejsRequestData = Omit<RequestData, 'body'> & {
  body?: CloneableBody
}

export interface FetchEventResult {
  response: Response
  waitUntil: Promise<any>
}

export type NextMiddlewareResult =
  | NextResponse
  | Response
  | null
  | undefined
  | void

export type NextMiddleware = (
  request: NextRequest,
  event: NextFetchEvent
) => NextMiddlewareResult | Promise<NextMiddlewareResult>
