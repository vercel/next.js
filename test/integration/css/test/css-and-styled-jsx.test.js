/* eslint-env jest */
import { remove } from 'fs-extra'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const fixturesDir = join(__dirname, '../..', 'css-fixtures')

describe('Ordering with styled-jsx (dev)', () => {
  const appDir = join(fixturesDir, 'with-styled-jsx')

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

  it('should have the correct color (css ordering)', async () => {
    const browser = await webdriver(appPort, '/')

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('.my-text')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 128, 0)"`)
  })
})

describe('Ordering with styled-jsx (prod)', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(fixturesDir, 'with-styled-jsx')

      let appPort
      let app
      let stdout
      let code
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
        ;({ code, stdout } = await nextBuild(appDir, [], {
          stdout: true,
        }))
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      it('should have compiled successfully', () => {
        expect(code).toBe(0)
        expect(stdout).toMatch(/Compiled successfully/)
      })

      it('should have the correct color (css ordering)', async () => {
        const browser = await webdriver(appPort, '/')

        const currentColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('.my-text')).color`
        )
        expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 128, 0)"`)
      })
    }
  )
})
