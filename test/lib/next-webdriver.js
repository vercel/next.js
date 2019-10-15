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
      },
      async getComputedCss (style) {
        return t.eval(
          () => window.getComputedStyle(document.querySelector(sel))[style],
          {
            dependencies: { sel, style }
          }
        )
      },
      getAttribute (attr) {
        attr = attr === 'class' ? 'className' : attr

        return t.eval(() => document.querySelector(sel)[attr], {
          dependencies: { sel, attr }
        })
      }
    }
  }

  async waitForElementByCss (sel) {
    await Selector(sel).innerText
    return this
  }

  async refresh () {
    const url = await t.eval(() => window.location.href)
    await t.navigateTo(url)
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
