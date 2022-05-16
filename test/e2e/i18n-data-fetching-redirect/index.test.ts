import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check } from 'next-test-utils'
import webdriver from 'next-webdriver'

describe('i18n-data-fetching-redirect', () => {
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

  describe('Redirect to another locale', () => {
    test.each([
      ['getServerSideProps', '/sv/gssp-redirect'],
      ['getStaticProps blocking', '/sv/gsp-blocking-redirect/1'],
      ['getStaticProps fallback', '/sv/gsp-fallback-redirect/1'],
    ])('%s', async (_, path) => {
      const browser = await webdriver(next.url, path)

      await check(() => browser.eval('window.location.pathname'), '/en/home')
      expect(await browser.elementByCss('#router-locale').text()).toBe('en')
      expect(await browser.elementByCss('#router-pathname').text()).toBe(
        '/home'
      )
      expect(await browser.elementByCss('#router-as-path').text()).toBe('/home')
    })
  })
})
