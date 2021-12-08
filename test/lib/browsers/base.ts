// This is the base Browser interface all browser
// classes should build off of, it is the bare
// methods we aim to support across tests
export class BrowserInterface {
  private promise: any
  private then: any
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

  async setup(browserName: string): Promise<void> {}
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
  click(): BrowserInterface {
    return this
  }
  type(text: string): BrowserInterface {
    return this
  }
  waitForElementByCss(selector: string, timeout?: number): BrowserInterface {
    return this
  }
  waitForCondition(snippet: string, timeout?: number): BrowserInterface {
    return this
  }
  back(): BrowserInterface {
    return this
  }
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
  async loadPage(url: string): Promise<any> {}
  async get(url: string): Promise<void> {}

  async getValue(): Promise<any> {}
  async getAttribute(name: string): Promise<any> {}
  async eval(snippet: string | Function): Promise<any> {}
  async evalAsync(snippet: string | Function): Promise<any> {}
  async text(): Promise<string> {
    return ''
  }
  async getComputedCss(prop: string): Promise<string> {
    return ''
  }
  async hasElementByCssSelector(selector: string): Promise<boolean> {
    return false
  }
  async log(): Promise<any[]> {
    return []
  }
  async websocketFrames(): Promise<any[]> {
    return []
  }
  async url(): Promise<string> {
    return ''
  }
}
