import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { BrowserInterface } from 'test/lib/browsers/base'
import { join } from 'path'

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
    await new Promise((resolve) => setTimeout(resolve, 500))

    // go to another page
    await browser.elementByCss('[data-next-page]').click()
    await new Promise((resolve) => setTimeout(resolve, 500))

    // do shadow replace
    await browser.elementByCss('[data-next-shallow-replace]').click()
    await new Promise((resolve) => setTimeout(resolve, 500))

    // go back using history api
    await browser.elementByCss('[data-go-back]').click()

    // get page h1
    let title = await browser.elementByCss('h1').text()
    expect(title).toContain('Content for page 1')
  })
})
