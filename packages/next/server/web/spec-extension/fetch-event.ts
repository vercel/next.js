import { DeprecationError } from '../error'
import { FetchEvent } from '../spec-compliant/fetch-event'
import { NextRequest } from './request'

export class NextFetchEvent extends FetchEvent {
  sourcePage: string

  constructor(params: { request: NextRequest; page: string }) {
    super(params.request)
    this.sourcePage = params.page
  }

  // @ts-ignore
  get request() {
    throw new DeprecationError({
      page: this.sourcePage,
    })
  }

  respondWith() {
    throw new DeprecationError({
      page: this.sourcePage,
    })
  }
}
