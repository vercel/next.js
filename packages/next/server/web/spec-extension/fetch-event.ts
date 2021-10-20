import { FetchEvent } from '../spec-compliant/fetch-event'
import { NextRequest } from './request'

export class NextFetchEvent extends FetchEvent {
  readonly request: NextRequest
  constructor(request: NextRequest) {
    super(request)
    this.request = request
  }
}
