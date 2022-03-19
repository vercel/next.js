import { DeprecationError } from '../error'
import { FetchEvent } from '../spec-compliant/fetch-event'
import { NextRequest } from './request'

export class NextFetchEvent extends FetchEvent {
  sourcePage: string

  constructor(params: { request: NextRequest; page: string }) {
    super(params.request)
    this.sourcePage = params.page
  }

  /**
   * @deprecated The first parameter is now the request and the API is now async
   * with the form:
   *
   * ```ts
   * export function middleware(request, event) {
   *   return new Response("Hello " + request.url)
   * }
   * ```
   *
   * Read more: https://nextjs.org/docs/messages/middleware-new-signature
   */
  get request() {
    throw new DeprecationError({
      page: this.sourcePage,
    })
  }

  /**
   * @deprecated `respondWith` is no longer needed and the API is now async
   * with the form:
   *
   * ```ts
   * export function middleware(request, event) {
   *   return new Response("Hello " + request.url)
   * }
   * ```
   *
   * Read more: https://nextjs.org/docs/messages/middleware-new-signature
   */
  respondWith() {
    throw new DeprecationError({
      page: this.sourcePage,
    })
  }
}
