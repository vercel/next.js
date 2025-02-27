export type Event = 'request' | 'response'

/**
 * This is the base Browser interface all browser
 * classes should build on, it is the bare
 * methods we aim to support across tests
 */
export abstract class BrowserInterface<TCurrent = any> {
  private promise?: Promise<TCurrent>;

  // necessary for the type of the function below
  readonly [Symbol.toStringTag]: string = 'BrowserInterface'

  protected chain<TNext>(
    nextCall: (current: TCurrent) => TNext | Promise<TNext>
  ): BrowserInterface<TNext> & Promise<TNext> {
    const syncError = new Error('next-browser-base-chain-error')
    const promise = Promise.resolve(this.promise)
      .then(nextCall)
      .catch((reason) => {
        if (
          reason !== null &&
          typeof reason === 'object' &&
          'stack' in reason
        ) {
          const syncCallStack = syncError.stack.split(syncError.message)[1]
          reason.stack += `\n${syncCallStack}`
        }
        throw reason
      })

    function get(target: BrowserInterface<TNext>, p: string | symbol): any {
      switch (p) {
        case 'promise':
          return promise
        case 'then':
          return promise.then.bind(promise)
        case 'catch':
          return promise.catch.bind(promise)
        case 'finally':
          return promise.finally.bind(promise)
        default:
          return target[p]
      }
    }

    return new Proxy<any>(this, {
      get,
    })
  }

  abstract setup(
    browserName: string,
    locale: string,
    javaScriptEnabled: boolean,
    ignoreHttpsErrors: boolean,
    headless: boolean
  ): Promise<void>
  abstract close(): Promise<void>

  abstract elementsByCss(
    selector: string
  ): BrowserInterface<any[]> & Promise<any[]>
  abstract elementByCss(selector: string): BrowserInterface<any> & Promise<any>
  abstract elementById(selector: string): BrowserInterface<any> & Promise<any>
  abstract touchStart(): BrowserInterface<any> & Promise<any>
  abstract click(): BrowserInterface<any> & Promise<any>
  abstract keydown(key: string): BrowserInterface<any> & Promise<any>
  abstract keyup(key: string): BrowserInterface<any> & Promise<any>
  abstract type(text: string): BrowserInterface<any> & Promise<any>
  abstract moveTo(): BrowserInterface<any> & Promise<any>
  abstract waitForElementByCss(
    selector: string,
    timeout?: number
  ): BrowserInterface<any> & Promise<any>
  abstract waitForCondition(
    snippet: string,
    timeout?: number
  ): BrowserInterface<any> & Promise<any>
  /**
   * Use browsers `go back` functionality.
   */
  abstract back(options?: any): BrowserInterface<any> & Promise<any>
  /**
   * Use browsers `go forward` functionality. Inverse of back.
   */
  abstract forward(options?: any): BrowserInterface<any> & Promise<any>
  abstract refresh(): BrowserInterface<any> & Promise<any>
  abstract setDimensions(opts: {
    height: number
    width: number
  }): BrowserInterface<any> & Promise<any>
  abstract addCookie(opts: {
    name: string
    value: string
  }): BrowserInterface<any> & Promise<any>
  abstract deleteCookies(): BrowserInterface<void> & Promise<void>
  abstract on(event: Event, cb: (...args: any[]) => void): void
  abstract off(event: Event, cb: (...args: any[]) => void): void
  abstract loadPage(
    url: string,
    {
      disableCache,
      cpuThrottleRate,
      beforePageLoad,
      pushErrorAsConsoleLog,
    }?: {
      disableCache?: boolean
      cpuThrottleRate?: number
      beforePageLoad?: Function
      pushErrorAsConsoleLog?: boolean
    }
  ): Promise<void>
  abstract get(url: string): Promise<void>
  abstract getValue(): Promise<string>
  abstract getAttribute(name: string): Promise<string>
  abstract eval(snippet: string | Function, ...args: any[]): Promise<any>
  abstract evalAsync(snippet: string | Function, ...args: any[]): Promise<any>
  abstract text(): Promise<string>
  abstract getComputedCss(prop: string): Promise<string>
  abstract hasElementByCssSelector(selector: string): Promise<boolean>
  abstract log<T extends boolean = false>(options?: {
    includeArgs?: T
  }): Promise<
    T extends true
      ? { source: string; message: string; args: unknown[] }[]
      : { source: string; message: string }[]
  >
  abstract websocketFrames(): Promise<any[]>
  abstract url(): Promise<string>
  abstract waitForIdleNetwork(): Promise<void>
}
