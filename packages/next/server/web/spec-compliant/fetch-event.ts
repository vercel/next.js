export const responseSymbol = Symbol('response')
export const passThroughSymbol = Symbol('passThrough')
export const waitUntilSymbol = Symbol('waitUntil')

export class FetchEvent {
  readonly request: Request;
  readonly [waitUntilSymbol]: Promise<any>[] = [];
  [responseSymbol]?: Promise<Response>;
  [passThroughSymbol] = false

  constructor(request: Request) {
    this.request = request
  }

  respondWith(response: Response | Promise<Response>): void {
    if (!this[responseSymbol]) {
      this[responseSymbol] = Promise.resolve(response)
    }
  }

  passThroughOnException(): void {
    this[passThroughSymbol] = true
  }

  waitUntil(promise: Promise<any>): void {
    this[waitUntilSymbol].push(promise)
  }
}
