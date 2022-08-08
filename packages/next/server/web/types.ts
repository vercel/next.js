import type { I18NConfig } from '../config-shared'
import type { NextRequest } from '../web/spec-extension/request'
import type { NextFetchEvent } from '../web/spec-extension/fetch-event'
import type { NextResponse } from './spec-extension/response'
import type { ClonableBody } from '../body-streams'

export interface NodeHeaders {
  [header: string]: string | string[] | undefined
}

export interface CookieSerializeOptions {
  domain?: string
  encode?(val: string): string
  expires?: Date
  httpOnly?: boolean
  maxAge?: number
  path?: string
  sameSite?: boolean | 'lax' | 'strict' | 'none'
  secure?: boolean
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
  body?: ClonableBody
}

export interface FetchEventResult {
  response: Response
  waitUntil: Promise<any>
}

export type NextMiddlewareResult = NextResponse | Response | null | undefined

export type NextMiddleware = (
  request: NextRequest,
  event: NextFetchEvent
) => NextMiddlewareResult | Promise<NextMiddlewareResult>
