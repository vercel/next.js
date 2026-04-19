import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'
import { check } from 'next-test-utils'

describe('browser-shallow-navigation', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
        'middleware.js': new FileRef(join(__dirname, 'app/middleware.js')),
      },
    })
  })

  afterAll(() => next.destroy())

  it('should render the correct page', async () => {
    const browser = await webdriver(next.url, '/')

    /// do shallow push
    await browser.elementByCss('[data-next-shallow-push]').click()
    await browser.waitForElementByCss('[data-next-page]')

    // go to another page
    await browser.elementByCss('[data-next-page]').click()
    await browser.waitForElementByCss('[data-next-shallow-replace]')

    // do shadow replace
    await browser.elementByCss('[data-next-shallow-replace]').click()
    await browser.waitForElementByCss('[data-go-back]')

    // go back using history api
    await browser.elementByCss('[data-go-back]').click()

    // get page h1
    await check(() => browser.elementByCss('h1').text(), /Content for page 1/)
  })
})
