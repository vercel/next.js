/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { findPort, killApp, launchApp } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)
const appDir = join(__dirname, '..')
let app
let appPort

describe('Unsafe next/head usage', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should not warn by default', async () => {
    const browser = await webdriver(appPort, '/default')
    expect(await browser.eval('window.caughtWarns')).toEqual([])
  })

  it('should not warn when using safe patterns', async () => {
    const browser = await webdriver(appPort, '/safe-patterns')
    expect(await browser.eval('window.caughtWarns')).toEqual([])
  })

  it('should warn when using multiple heads', async () => {
    const browser = await webdriver(appPort, '/multiple-heads')
    expect(await browser.eval('window.caughtWarns')).toMatchInlineSnapshot(`
      Array [
        "You are using next/head in the following unsafe way that may prevent you from using future React and Next.js features:
      - More than one instance of <Head>
      Learn more here: https://nextjs.org/docs/messages/next-head-unsafe",
      ]
    `)
  })

  it('should warn when using styles in head', async () => {
    const browser = await webdriver(appPort, '/styles-in-head')
    expect(await browser.eval('window.caughtWarns')).toMatchInlineSnapshot(`
      Array [
        "You are using next/head in the following unsafe way that may prevent you from using future React and Next.js features:
      - Behavioral Element (<style></style>)
      Learn more here: https://nextjs.org/docs/messages/next-head-unsafe",
      ]
    `)
  })

  it('should warn when using scripts in head', async () => {
    const browser = await webdriver(appPort, '/scripts-in-head')
    expect(await browser.eval('window.caughtWarns')).toMatchInlineSnapshot(`
      Array [
        "You are using next/head in the following unsafe way that may prevent you from using future React and Next.js features:
      - Behavioral Element (<script></script>)
      Learn more here: https://nextjs.org/docs/messages/next-head-unsafe",
      ]
    `)
  })

  it('should show multiple warnings but only once', async () => {
    const browser = await webdriver(appPort, '/multiple-warnings')
    expect(await browser.eval('window.caughtWarns')).toMatchInlineSnapshot(`
Array [
  "You are using next/head in the following unsafe ways that may prevent you from using future React and Next.js features:
- More than one instance of <Head>
- Behavioral Element (<script></script>)
- Behavioral Element (<style></style>)
- Behavioral Element (<base/>)
- Behavioral Element (<link/>)
Learn more here: https://nextjs.org/docs/messages/next-head-unsafe",
]
`)
  })
})
