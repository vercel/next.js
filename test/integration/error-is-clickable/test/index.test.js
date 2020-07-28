/* eslint-env jest */

import { findPort, killApp, launchApp } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 5)
let app
let appPort
const appDir = join(__dirname, '..')

describe('Clickable error link', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
    })
  })
  afterAll(() => killApp(app))

  it('Shows error which is clickable and redirects', async () => {
    const browser = await webdriver(appPort, '/first')

    await browser.eval(`(function () {
          document.querySelector("nextjs-portal")
          .shadowRoot
          .querySelector("#nextjs__container_errors_desc > a").click()
          })()
        `)
    const url = await browser.url()

    expect(url).toBe('https://nextjs.org/')
  })
})
