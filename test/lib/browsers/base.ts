export type Event = 'request'

/**
 * This is the base Browser interface all browser
 * classes should build off of, it is the bare
 * methods we aim to support across tests
 *
 * They will always await last executed command.
 * The interface is mutable - it doesn't have to be in sequece.
 *
 * You can manually await this interface to wait for completion of the last scheduled command.
 */
export abstract class BrowserInterface implements PromiseLike<any> {
  private promise: any
  then: PromiseLike<any>['then']
  private catch: any

  protected chain(nextCall: any): BrowserInterface {
    if (!this.promise) {
      this.promise = Promise.resolve(this)
    }
    this.promise = this.promise.then(nextCall)
    this.then = (...args) => this.promise.then(...args)
    this.catch = (...args) => this.promise.catch(...args)
    return this
  }

  /**
   * This function will run in chain - it will wait for previous commands.
   * But it won't have an effect on chain value and chain will still be green if this throws.
   */
  protected chainWithReturnValue<T>(
    callback: (...args: any[]) => Promise<T>
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.chain(async (...args: any[]) => {
        try {
          resolve(await callback(...args))
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  async setup(
    browserName: string,
    locale: string,
    javaScriptEnabled: boolean
  ): Promise<void> {}
  async close(): Promise<void> {}
  async quit(): Promise<void> {}

  elementsByCss(selector: string): BrowserInterface[] {
    return [this]
  }
  elementByCss(selector: string): BrowserInterface {
    return this
  }
  elementById(selector: string): BrowserInterface {
    return this
  }
  touchStart(): BrowserInterface {
    return this
  }
  click(opts?: { modifierKey?: boolean }): BrowserInterface {
    return this
  }
  keydown(key: string): BrowserInterface {
    return this
  }
  keyup(key: string): BrowserInterface {
    return this
  }
  focusPage(): BrowserInterface {
    return this
  }
  type(text: string): BrowserInterface {
    return this
  }
  moveTo(): BrowserInterface {
    return this
  }
  // TODO(NEXT-290): type this correctly as awaitable
  waitForElementByCss(selector: string, timeout?: number): BrowserInterface {
    return this
  }
  waitForCondition(snippet: string, timeout?: number): BrowserInterface {
    return this
  }
  /**
   * Use browsers `go back` functionality.
   */
  back(): BrowserInterface {
    return this
  }
  /**
   * Use browsers `go forward` functionality. Inverse of back.
   */
  forward(): BrowserInterface {
    return this
  }
  refresh(): BrowserInterface {
    return this
  }
  setDimensions(opts: { height: number; width: number }): BrowserInterface {
    return this
  }
  addCookie(opts: { name: string; value: string }): BrowserInterface {
    return this
  }
  deleteCookies(): BrowserInterface {
    return this
  }
  on(event: Event, cb: (...args: any[]) => void) {}
  off(event: Event, cb: (...args: any[]) => void) {}
  async loadPage(
    url: string,
    { disableCache: boolean, beforePageLoad: Function }
  ): Promise<void> {}
  async get(url: string): Promise<void> {}

  async getValue<T = any>(): Promise<T> {
    return
  }
  async getAttribute<T = any>(name: string): Promise<T> {
    return
  }
  async eval<T = any>(snippet: string | Function, ...args: any[]): Promise<T> {
    return
  }
  async evalAsync<T = any>(
    snippet: string | Function,
    ...args: any[]
  ): Promise<T> {
    return
  }
  async text(): Promise<string> {
    return ''
  }
  async getComputedCss(prop: string): Promise<string> {
    return ''
  }
  async hasElementByCssSelector(selector: string): Promise<boolean> {
    return false
  }
  async log(): Promise<
    { source: 'error' | 'info' | 'log'; message: string }[]
  > {
    return []
  }
  async websocketFrames(): Promise<any[]> {
    return []
  }
  async url(): Promise<string> {
    return ''
  }

  async waitForIdleNetwork(): Promise<void> {}
}
