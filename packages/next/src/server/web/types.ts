import type { ExperimentalConfig, I18NConfig } from '../config-shared'
import type { NextRequest } from './spec-extension/request'
import type { NextFetchEvent } from './spec-extension/fetch-event'
import type { NextResponse } from './spec-extension/response'
import type { CloneableBody } from '../body-streams'
import type { OutgoingHttpHeaders } from 'http'
import type { FetchMetrics } from '../base-http'

export type { MiddlewareConfigInput as MiddlewareConfig } from '../../build/segment-config/middleware/middleware-config'

export interface RequestData {
  headers: OutgoingHttpHeaders
  method: string
  nextConfig?: {
    basePath?: string
    i18n?: I18NConfig | null
    trailingSlash?: boolean
    experimental?: Pick<ExperimentalConfig, 'cacheLife' | 'authInterrupts'>
  }
  page?: {
    name?: string
    params?: { [key: string]: string | string[] | undefined }
  }
  url: string
  body?: ReadableStream<Uint8Array>
  signal: AbortSignal
  /** passed in when running in edge runtime sandbox */
  waitUntil?: (promise: Promise<any>) => void
}

export type NodejsRequestData = Omit<RequestData, 'body'> & {
  body?: CloneableBody
}

export interface FetchEventResult {
  response: Response
  waitUntil: Promise<any>
  fetchMetrics?: FetchMetrics
}

export type NextMiddlewareResult =
  | NextResponse
  | Response
  | null
  | undefined
  | void

/**
 * Middleware allows you to run code before a request is completed.
 * Then, based on the incoming request, you can modify the response
 * by rewriting, redirecting, modifying the request or response headers,
 * or responding directly.
 *
 * Read more: [Next.js Docs: Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
 */
export type NextMiddleware = (
  request: NextRequest,
  event: NextFetchEvent
) => NextMiddlewareResult | Promise<NextMiddlewareResult>
