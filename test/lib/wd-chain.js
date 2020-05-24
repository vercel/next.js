import { until, By } from 'selenium-webdriver'

export default class Chain {
  constructor(browser) {
    this.browser = browser
  }

  updateChain(nextCall) {
    if (!this.promise) {
      this.promise = Promise.resolve()
    }
    this.promise = this.promise.then(nextCall)
    this.then = cb => this.promise.then(cb)
    this.catch = cb => this.promise.catch(cb)
    this.finally = cb => this.promise.finally(cb)
    return this
  }

  elementByCss(sel) {
    return this.updateChain(() =>
      this.browser.findElement(By.css(sel)).then(el => {
        el.sel = sel
        el.text = () => el.getText()
        el.getComputedCss = prop => el.getCssValue(prop)
        el.type = text => el.sendKeys(text)
        el.getValue = () =>
          this.browser.executeScript(
            `return document.querySelector('${sel}').value`
          )
        return el
      })
    )
  }

  elementById(sel) {
    return this.elementByCss(`#${sel}`)
  }

  getValue() {
    return this.updateChain(el =>
      this.browser.executeScript(
        `return document.querySelector('${el.sel}').value`
      )
    )
  }

  text() {
    return this.updateChain(el => el.getText())
  }

  type(text) {
    return this.updateChain(el => el.sendKeys(text))
  }

  moveTo() {
    return this.updateChain(el => {
      return this.browser
        .actions()
        .move({ origin: el })
        .perform()
        .then(() => el)
    })
  }

  getComputedCss(prop) {
    return this.updateChain(el => {
      return el.getCssValue(prop)
    })
  }

  getAttribute(attr) {
    return this.updateChain(el => el.getAttribute(attr))
  }

  hasElementByCssSelector(sel) {
    return this.eval(`document.querySelector('${sel}')`)
  }

  click() {
    return this.updateChain(el => {
      return el.click().then(() => el)
    })
  }

  elementsByCss(sel) {
    return this.updateChain(() => this.browser.findElements(By.css(sel)))
  }

  waitForElementByCss(sel, timeout) {
    return this.updateChain(() =>
      this.browser.wait(until.elementLocated(By.css(sel), timeout))
    )
  }

  eval(snippet) {
    if (typeof snippet === 'string' && !snippet.startsWith('return')) {
      snippet = `return ${snippet}`
    }
    return this.updateChain(() => this.browser.executeScript(snippet))
  }

  log(type) {
    return this.updateChain(() =>
      this.browser
        .manage()
        .logs()
        .get(type)
    )
  }

  url() {
    return this.updateChain(() => this.browser.getCurrentUrl())
  }

  back() {
    return this.updateChain(() => this.browser.navigate().back())
  }

  forward() {
    return this.updateChain(() => this.browser.navigate().forward())
  }

  refresh() {
    return this.updateChain(() => this.browser.navigate().refresh())
  }

  close() {
    return this.updateChain(() => Promise.resolve())
  }
  quit() {
    return this.close()
  }
}
