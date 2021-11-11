export const responseSymbol = Symbol('response')
export const passThroughSymbol = Symbol('passThrough')
export const waitUntilSymbol = Symbol('waitUntil')

export class FetchEvent {
  readonly [waitUntilSymbol]: Promise<any>[] = [];
  [responseSymbol]?: Promise<Response>;
  [passThroughSymbol] = false

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
    this[waitUntilSymbol].push(promise)
  }
}
