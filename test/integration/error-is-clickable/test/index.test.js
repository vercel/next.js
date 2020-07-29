/* eslint-env jest */

import {
  findPort,
  killApp,
  launchApp,
  hasRedbox,
  getRedboxHeader,
  evaluate,
  waitFor,
} from 'next-test-utils'
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

    await hasRedbox(browser)

    await evaluate(browser, () => {
      document
        .querySelector('body > nextjs-portal')
        .shadowRoot.querySelector(
          '#nextjs__container_errors_desc > a:nth-child(1)'
        )
        .click()
    })

    await waitFor(1000)
    const url = await browser.url()

    expect(url).toBe('https://nextjs.org/')
  })

  it('Handles multiple links in error', async () => {
    const browser = await webdriver(appPort, '/first')

    // Open the first link from error
    await hasRedbox(browser)

    await evaluate(browser, () => {
      document
        .querySelector('body > nextjs-portal')
        .shadowRoot.querySelector(
          '#nextjs__container_errors_desc > a:nth-child(1)'
        )
        .click()
    })
    await waitFor(1000)
    const url1 = await browser.url()

    // Go back to error page
    await browser.back()

    // Open the second link from error
    await hasRedbox(browser)

    await evaluate(browser, () => {
      document
        .querySelector('body > nextjs-portal')
        .shadowRoot.querySelector(
          '#nextjs__container_errors_desc > a:nth-child(2)'
        )
        .click()
    })
    await waitFor(1000)
    const url2 = await browser.url()

    expect({ url1, url2 }).toEqual({
      url1: 'https://nextjs.org/',
      url2: 'https://nextjs.org/docs',
    })
  })

  it('Shows error message correctly', async () => {
    const browser = await webdriver(appPort, '/first')
    await hasRedbox(browser)
    const headerText = await getRedboxHeader(browser)
    expect(headerText).toMatch(
      /Error: This error should be clickable\. https:\/\/nextjs\.org is the homepage\. Visit https:\/\/nextjs\.org\/docs for documentation/
    )
  })
})
