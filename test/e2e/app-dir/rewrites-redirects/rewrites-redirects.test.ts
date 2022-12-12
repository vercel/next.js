import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import { waitFor } from 'next-test-utils'

describe('redirects and rewrites', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(__dirname),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
        typescript: 'latest',
        '@types/react': 'latest',
        '@types/node': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  describe.each(['link', 'button'])('navigation using %s', (testType) => {
    it('should rewrite from middleware correctly', async () => {
      const browser = await webdriver(next.url, '/')
      browser.elementById(`${testType}-middleware-rewrite`).click()
      await waitFor(200)

      expect(await browser.elementById('page').text()).toBe(
        'middleware-rewrite-after'
      )
      const url = new URL(await browser.url())
      expect(url.pathname).toEndWith('-before')
    })

    it('should redirect from middleware correctly', async () => {
      const browser = await webdriver(next.url, '/')
      browser.elementById(`${testType}-middleware-redirect`).click()
      await waitFor(200)

      expect(await browser.elementById('page').text()).toBe(
        'middleware-redirect-after'
      )
      const url = new URL(await browser.url())
      expect(url.pathname).toEndWith('-after')
    })
  })
})
