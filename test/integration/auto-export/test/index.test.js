/* eslint-env jest */

import webdriver from 'next-webdriver'
import path from 'path'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  launchApp,
  check,
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')
let appPort
let app

const runTests = () => {
  it('Supports commonjs 1', async () => {
    const browser = await webdriver(appPort, '/commonjs1')
    const html = await browser.eval('document.body.innerHTML')
    expect(html).toMatch(/test1/)
    expect(html).toMatch(/nextExport/)
    await browser.close()
  })

  it('Supports commonjs 2', async () => {
    const browser = await webdriver(appPort, '/commonjs2')
    const html = await browser.eval('document.body.innerHTML')
    expect(html).toMatch(/test2/)
    expect(html).toMatch(/nextExport/)
    await browser.close()
  })

  it('Refreshes query on mount', async () => {
    const browser = await webdriver(appPort, '/post-1')
    await check(() => browser.eval('document.body.innerHTML'), /post.*post-1/)
    const html = await browser.eval('document.body.innerHTML')
    expect(html).toMatch(/nextExport/)
  })

  it('should update asPath after mount', async () => {
    const browser = await webdriver(appPort, '/zeit/cmnt-2')
    await check(
      () => browser.eval(`document.documentElement.innerHTML`),
      /\/zeit\/cmnt-2/
    )
  })

  it('should not replace URL with page name while asPath is delayed', async () => {
    const browser = await webdriver(appPort, '/zeit/cmnt-1')
    const val = await browser.eval(`!!window.pathnames.find(function(p) {
      return p !== '/zeit/cmnt-1'
    })`)
    expect(val).toBe(false)
  })
}

describe('Auto Export', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })

    afterAll(async () => {
      await killApp(app)
    })

    runTests()
  })

  describe('dev', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })

    afterAll(() => killApp(app))

    runTests()

    it('should not show hydration warning from mismatching asPath', async () => {
      const browser = await webdriver(appPort, '/zeit/cmnt-1')
      const caughtWarns = await browser.eval(`window.caughtWarns`)
      expect(caughtWarns).toEqual([])
    })

    it('should include error link when hydration error does occur', async () => {
      const browser = await webdriver(appPort, '/post-1/hydrate-error')
      const logs = await browser.log()
      expect(
        logs.some((log) =>
          log.message.includes(
            'See more info here: https://nextjs.org/docs/messages/react-hydration-error'
          )
        )
      ).toBe(true)
    })
  })
})
