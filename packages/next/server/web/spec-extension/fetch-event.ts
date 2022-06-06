import Primitives from 'next/dist/compiled/@edge-runtime/primitives'
import { DeprecationSignatureError } from '../error'
import { NextRequest } from './request'

export class NextFetchEvent extends Primitives.FetchEvent {
  sourcePage: string

  constructor(params: { request: NextRequest; page: string }) {
    super(params.request)
    this.sourcePage = params.page
  }

  /**
   * @deprecated The `request` is now the first parameter and the API is now async.
   *
   * Read more: https://nextjs.org/docs/messages/middleware-new-signature
   */
  get request() {
    throw new DeprecationSignatureError({
      page: this.sourcePage,
    })
  }

  /**
   * @deprecated Using `respondWith` is no longer needed.
   *
   * Read more: https://nextjs.org/docs/messages/middleware-new-signature
   */
  respondWith() {
    throw new DeprecationSignatureError({
      page: this.sourcePage,
    })
  }
}
