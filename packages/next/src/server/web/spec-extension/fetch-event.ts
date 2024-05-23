import { PageSignatureError } from '../error'
import type { NextRequest } from './request'

const responseSymbol = Symbol('response')
const passThroughSymbol = Symbol('passThrough')
const awaiterSymbol = Symbol('awaiter')
const waitUntilCacheSymbol = Symbol('waitUntil.cache')

export const waitUntilSymbol = Symbol('waitUntil')

class FetchEvent {
  [responseSymbol]?: Promise<Response>;
  [passThroughSymbol] = false;

  [awaiterSymbol] = new Awaiter();
  [waitUntilCacheSymbol]: Promise<void> | undefined = undefined

  get [waitUntilSymbol](): Promise<void> {
    if (!this[waitUntilCacheSymbol]) {
      this[waitUntilCacheSymbol] = this[awaiterSymbol].awaiting()
    }
    return this[waitUntilCacheSymbol]
  }

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(_request: Request) {}

  respondWith(response: Response | Promise<Response>): void {
    if (!this[responseSymbol]) {
      this[responseSymbol] = Promise.resolve(response)
    }
  }

  passThroughOnException(): void {
    this[passThroughSymbol] = true
  }

  waitUntil(promise: Promise<any>): void {
    this[awaiterSymbol].waitUntil(promise)
  }
}

export class NextFetchEvent extends FetchEvent {
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

/**
 * The Awaiter class is used to manage and await multiple promises.
 */
export class Awaiter {
  private promises: Set<Promise<unknown>> = new Set()
  private onError: ((error: Error) => void) | undefined

  constructor({ onError }: { onError?: (error: Error) => void } = {}) {
    this.onError = onError ?? console.error
  }

  public waitUntil = (promise: Promise<unknown>) => {
    this.promises.add(promise)
  }

  public async awaiting(): Promise<void> {
    let hasMorePromises: boolean
    do {
      hasMorePromises = await this.waitForBatch()
    } while (hasMorePromises)
  }

  private async waitForBatch() {
    if (!this.promises.size) {
      return false
    }

    const promises = Array.from(this.promises)
    this.promises.clear()
    await Promise.all(
      promises.map((promise) => Promise.resolve(promise).catch(this.onError))
    )

    return this.promises.size > 0
  }
}
