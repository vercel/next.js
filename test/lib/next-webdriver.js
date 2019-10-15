import { t, Selector } from 'testcafe'

class WdInterface {
  async get (url) {
    await t.navigateTo(url)
  }

  elementByCss (sel) {
    const el = Selector(sel)

    return {
      async click () {
        await t.click(el)
        return this
      },
      async text () {
        return el.innerText
      }
    }
  }

  async waitForElementByCss (sel) {
    await Selector(sel)
    return this
  }

  log () {
    return t.getBrowserConsoleMessages()
  }

  close () {}
}

export default async function webdriver (appPort, pathname) {
  const wd = new WdInterface()
  await wd.get(`http://localhost:${appPort}${pathname}`)
  return wd
}
