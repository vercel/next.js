import type { WaitUntil } from '../../after/builtin-request-context'
import { PageSignatureError } from '../error'
import type { NextRequest } from './request'

const responseSymbol = Symbol('response')
const passThroughSymbol = Symbol('passThrough')
const waitUntilSymbol = Symbol('waitUntil')

class FetchEvent {
  // TODO(after): get rid of the 'internal' variant and always use an external waitUntil
  // (this means removing `FetchEventResult.waitUntil` which also requires a builder change)
  readonly [waitUntilSymbol]:
    | { kind: 'internal'; promises: Promise<any>[] }
    | { kind: 'external'; function: WaitUntil };

  [responseSymbol]?: Promise<Response>;
  [passThroughSymbol] = false

  constructor(_request: Request, waitUntil?: WaitUntil) {
    this[waitUntilSymbol] = waitUntil
      ? { kind: 'external', function: waitUntil }
      : { kind: 'internal', promises: [] }
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
    if (this[waitUntilSymbol].kind === 'external') {
      // if we received an external waitUntil, we delegate to it
      // TODO(after): this will make us not go through `getServerError(error, 'edge-server')` in `sandbox`
      const waitUntil = this[waitUntilSymbol].function
      return waitUntil(promise)
    } else {
      // if we didn't receive an external waitUntil, we make it work on our own
      // (and expect the caller to do something with the promises)
      this[waitUntilSymbol].promises.push(promise)
    }
  }
}

export function getWaitUntilPromiseFromEvent(
  event: FetchEvent
): Promise<void> | undefined {
  return event[waitUntilSymbol].kind === 'internal'
    ? Promise.all(event[waitUntilSymbol].promises).then(() => {})
    : undefined
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
