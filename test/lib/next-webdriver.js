import { t, Selector } from 'testcafe'
import { waitFor } from './next-test-utils'

class WdInterface {
  async get (url) {
    await t.navigateTo(url)
  }

  eval (toEval = '') {
    return t.eval(
      () => {
        // eslint-disable-next-line
        return eval(toEval)
      },
      {
        dependencies: {
          toEval
        }
      }
    )
  }

  url () {
    return t.eval(() => window.location.href)
  }

  async elementsByCss (sel) {
    const numEls = await Selector(sel).count
    const elMethods = []

    for (let i = 0; i < numEls; i++) {
      elMethods.push({
        getAttribute (attr) {
          return t.eval(
            () => {
              const els = document.querySelectorAll(sel)
              const el = els[i]
              return el[attr]
            },
            {
              dependencies: { i, attr, sel }
            }
          )
        },
        text () {
          return t.eval(
            () => {
              const els = document.querySelectorAll(sel)
              const el = els[i]
              return el.innerText
            },
            {
              dependencies: { i, sel }
            }
          )
        },
        click () {
          return t.eval(
            () => {
              const els = document.querySelectorAll(sel)
              const el = els[i]
              return el.click()
            },
            {
              dependencies: { i, sel }
            }
          )
        }
      })
    }
    return elMethods
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
      },
      type (text) {
        return t.typeText(el, text)
      },
      getValue () {
        return el.value
      },
      moveTo () {
        return t.hover(el)
      }
    }
  }

  async waitForElementByCss (sel, timeout) {
    await Selector(sel, { timeout }).exists
    return this
  }

  async refresh () {
    const url = await t.eval(() => window.location.href)
    await t.navigateTo(url)
  }

  async back () {
    await t.eval(() => window.history.back())
  }

  async log (types) {
    const separated = await t.getBrowserConsoleMessages()
    let logs = []

    if (!Array.isArray(types)) {
      types = Object.keys(separated)
    }

    types.forEach(t => {
      logs = logs.concat(separated[t])
    })

    return logs
  }

  close () {}
}

export default async function webdriver (appPort, pathname, skipWait = false) {
  const wd = new WdInterface()
  await wd.get(`http://localhost:${appPort}${pathname}`)
  if (!skipWait) {
    // allow hydration to occur, many tests assume this has happened
    await waitFor(500)
  }
  return wd
}
