import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check } from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'

describe('link-with-api-rewrite', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
        'next.config.js': new FileRef(join(__dirname, 'app/next.config.js')),
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should perform hard navigation for rewritten urls', async () => {
    const browser = await webdriver(next.url, '/')

    try {
      // Click the link on the page, we expect that there will be a hard
      // navigation later (we do this be checking that the window global is
      // unset).
      await browser.eval('window.beforeNav = "hi"')
      await browser.elementById('rewrite').click()
      await check(() => browser.eval('window.beforeNav'), {
        test: (content) => content !== 'hi',
      })

      // Check to see that we were in fact navigated to the correct page.
      const pathname = await browser.eval('window.location.pathname')
      expect(pathname).toBe('/some/route/for')

      // Check to see that the resulting data is coming from the right endpoint.
      const text = await browser.eval(
        'window.document.documentElement.innerText'
      )
      expect(text).toBe('{"from":"/some/route/for"}')
    } finally {
      await browser.close()
    }
  })

  it('should perform hard navigation for direct urls', async () => {
    const browser = await webdriver(next.url, '/')

    try {
      // Click the link on the page, we expect that there will be a hard
      // navigation later (we do this be checking that the window global is
      // unset).
      await browser.eval('window.beforeNav = "hi"')
      await browser.elementById('direct').click()
      await check(() => browser.eval('window.beforeNav'), {
        test: (content) => content !== 'hi',
      })

      // Check to see that we were in fact navigated to the correct page.
      const pathname = await browser.eval('window.location.pathname')
      expect(pathname).toBe('/api/json')

      // Check to see that the resulting data is coming from the right endpoint.
      const text = await browser.eval(
        'window.document.documentElement.innerText'
      )
      expect(text).toBe('{"from":""}')
    } finally {
      await browser.close()
    }
  })
})
