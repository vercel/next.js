export type Event = 'request'

/**
 * This is the base Browser interface all browser
 * classes should build on, it is the bare
 * methods we aim to support across tests
 */
export abstract class BrowserInterface implements PromiseLike<any> {
  private promise?: Promise<any>
  then: Promise<any>['then']
  catch: Promise<any>['catch']
  finally: Promise<any>['finally'];

  // necessary for the type of the function below
  readonly [Symbol.toStringTag]: string = 'BrowserInterface'

  protected chain<T>(
    nextCall: (current: any) => T | PromiseLike<T>
  ): BrowserInterface & Promise<T> {
    const promise = Promise.resolve(this.promise).then(nextCall)

    function get(target: BrowserInterface, p: string | symbol): any {
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

  protected chainWithReturnValue<T>(
    callback: (value: any) => T | PromiseLike<T>
  ): Promise<T> {
    return Promise.resolve(this.promise).then(callback)
  }

  abstract setup(
    browserName: string,
    locale: string,
    javaScriptEnabled: boolean,
    ignoreHttpsErrors: boolean,
    headless: boolean
  ): Promise<void>
  abstract close(): Promise<void>

  abstract elementsByCss(selector: string): BrowserInterface[]
  abstract elementByCss(selector: string): BrowserInterface
  abstract elementById(selector: string): BrowserInterface
  abstract touchStart(): BrowserInterface
  abstract click(opts?: { modifierKey?: boolean }): BrowserInterface
  abstract keydown(key: string): BrowserInterface
  abstract keyup(key: string): BrowserInterface
  abstract type(text: string): BrowserInterface
  abstract moveTo(): BrowserInterface
  // TODO(NEXT-290): type this correctly as awaitable
  abstract waitForElementByCss(
    selector: string,
    timeout?: number
  ): BrowserInterface
  abstract waitForCondition(snippet: string, timeout?: number): BrowserInterface
  /**
   * Use browsers `go back` functionality.
   */
  abstract back(options?: any): BrowserInterface
  /**
   * Use browsers `go forward` functionality. Inverse of back.
   */
  abstract forward(options?: any): BrowserInterface
  abstract refresh(): BrowserInterface
  abstract setDimensions(opts: {
    height: number
    width: number
  }): BrowserInterface
  abstract addCookie(opts: { name: string; value: string }): BrowserInterface
  abstract deleteCookies(): BrowserInterface
  abstract on(event: Event, cb: (...args: any[]) => void): void
  abstract off(event: Event, cb: (...args: any[]) => void): void
  abstract loadPage(
    url: string,
    {
      disableCache,
      cpuThrottleRate,
      beforePageLoad,
      pushErrorAsConsoleLog,
    }: {
      disableCache?: boolean
      cpuThrottleRate?: number
      beforePageLoad?: Function
      pushErrorAsConsoleLog?: boolean
    }
  ): Promise<void>
  abstract get(url: string): Promise<void>

  abstract getValue<T = any>(): Promise<T>
  abstract getAttribute<T = any>(name: string): Promise<T>
  abstract eval<T = any>(snippet: string | Function, ...args: any[]): Promise<T>
  abstract evalAsync<T = any>(
    snippet: string | Function,
    ...args: any[]
  ): Promise<T>
  abstract text(): Promise<string>
  abstract getComputedCss(prop: string): Promise<string>
  abstract hasElementByCssSelector(selector: string): Promise<boolean>
  abstract log(): Promise<
    { source: 'error' | 'info' | 'log'; message: string }[]
  >
  abstract websocketFrames(): Promise<any[]>
  abstract url(): Promise<string>
  abstract waitForIdleNetwork(): Promise<void>
}
