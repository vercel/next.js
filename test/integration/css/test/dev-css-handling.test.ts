/* eslint-env jest */
import { remove } from 'fs-extra'
import {
  check,
  File,
  findPort,
  killApp,
  launchApp,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const fixturesDir = join(__dirname, '../..', 'css-fixtures')

describe('Can hot reload CSS without losing state', () => {
  const appDir = join(fixturesDir, 'multi-page')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  let appPort
  let app
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should update CSS color without remounting <input>', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/page1')

      const desiredText = 'hello world'
      await browser.elementById('text-input').type(desiredText)
      expect(await browser.elementById('text-input').getValue()).toBe(
        desiredText
      )

      const currentColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('.red-text')).color`
      )
      expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

      const cssFile = new File(join(appDir, 'styles/global1.css'))
      try {
        cssFile.replace('color: red', 'color: purple')

        await check(
          () =>
            browser.eval(
              `window.getComputedStyle(document.querySelector('.red-text')).color`
            ),
          'rgb(128, 0, 128)'
        )

        // ensure text remained
        expect(await browser.elementById('text-input').getValue()).toBe(
          desiredText
        )
      } finally {
        cssFile.restore()
      }
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})

describe('Has CSS in computed styles in Development', () => {
  const appDir = join(fixturesDir, 'multi-page')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  let appPort
  let app
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should have CSS for page', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/page2')

      const currentColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('.blue-text')).color`
      )
      expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})

describe('Body is not hidden when unused in Development', () => {
  const appDir = join(fixturesDir, 'unused')

  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  let appPort
  let app
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should have body visible', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      const currentDisplay = await browser.eval(
        `window.getComputedStyle(document.querySelector('body')).display`
      )
      expect(currentDisplay).toBe('block')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})

describe('Body is not hidden when broken in Development', () => {
  const appDir = join(fixturesDir, 'unused')

  let appPort
  let app
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should have body visible', async () => {
    const pageFile = new File(join(appDir, 'pages/index.js'))
    let browser
    try {
      pageFile.replace('<div />', '<div>')
      await waitFor(2000) // wait for recompile

      browser = await webdriver(appPort, '/')
      const currentDisplay = await browser.eval(
        `window.getComputedStyle(document.querySelector('body')).display`
      )
      expect(currentDisplay).toBe('block')
    } finally {
      pageFile.restore()
      if (browser) {
        await browser.close()
      }
    }
  })
})

describe('React Lifecyce Order (dev)', () => {
  const appDir = join(fixturesDir, 'transition-react')
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  let appPort
  let app
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should have the correct color on mount after navigation', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')

      // Navigate to other:
      await browser.waitForElementByCss('#link-other').click()
      const text = await browser.waitForElementByCss('#red-title').text()
      expect(text).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
