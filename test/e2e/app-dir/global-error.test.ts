import path from 'path'
import { getRedboxHeader, hasRedbox } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'

describe('app dir - global error', () => {
  let next: NextInstance
  const isDev = (global as any).isNextDev

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, './global-error')),
    })
  })
  afterAll(() => next.destroy())

  it('should trigger error component when an error happens during rendering', async () => {
    const browser = await webdriver(next.url, '/throw')
    await browser
      .waitForElementByCss('#error-trigger-button')
      .elementByCss('#error-trigger-button')
      .click()

    if (isDev) {
      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toMatch(/Error: Client error/)
    } else {
      await browser
      expect(await browser.elementByCss('#error').text()).toBe(
        'Error message: Client error'
      )
    }
  })
})
