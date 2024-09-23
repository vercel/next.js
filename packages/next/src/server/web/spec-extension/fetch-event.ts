import type { WaitUntil } from '../../after/builtin-request-context'
import { PageSignatureError } from '../error'
import type { NextRequest } from './request'

const responseSymbol = Symbol('response')
const passThroughSymbol = Symbol('passThrough')
export const waitUntilPromisesSymbol = Symbol('waitUntilPromises')
const waitUntilSymbol = Symbol('waitUntil')

class FetchEvent {
  readonly [waitUntilPromisesSymbol]: Promise<any>[] = [];
  readonly [waitUntilSymbol]: WaitUntil | undefined;
  [responseSymbol]?: Promise<Response>;
  [passThroughSymbol] = false

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(_request: Request, waitUntil?: WaitUntil) {
    this[waitUntilSymbol] = waitUntil
  }

  // TODO: is this dead code? NextFetchEvent never lets this get called
  respondWith(response: Response | Promise<Response>): void {
    if (!this[responseSymbol]) {
      this[responseSymbol] = Promise.resolve(response)
    }
  }

  // TODO: is this dead code? passThroughSymbol is unused
  passThroughOnException(): void {
    this[passThroughSymbol] = true
  }

  waitUntil(promise: Promise<any>): void {
    // TODO(after): this will make us not go through `getServerError(error, 'edge-server')` in `sandbox`
    if (this[waitUntilSymbol]) {
      return this[waitUntilSymbol](promise)
    }
    this[waitUntilPromisesSymbol].push(promise)
  }
}

export class NextFetchEvent extends FetchEvent {
  sourcePage: string

  constructor(params: {
    request: NextRequest
    page: string
    context: { waitUntil: WaitUntil } | undefined
  }) {
    super(params.request, params.context?.waitUntil)
    this.sourcePage = params.page
  }

  /**
   * @deprecated The `request` is now the first parameter and the API is now async.
   *
   * Read more: https://nextjs.org/docs/messages/middleware-new-signature
   */
  get request() {
    throw new PageSignatureError({
      page: this.sourcePage,
    })
  }

  /**
   * @deprecated Using `respondWith` is no longer needed.
   *
   * Read more: https://nextjs.org/docs/messages/middleware-new-signature
   */
  respondWith() {
    throw new PageSignatureError({
      page: this.sourcePage,
    })
  }
}
