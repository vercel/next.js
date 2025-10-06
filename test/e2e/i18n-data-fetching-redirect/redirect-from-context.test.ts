import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { check } from 'next-test-utils'
import webdriver from 'next-webdriver'

describe('i18n-data-fetching-redirect', () => {
  let next: NextInstance

  // TODO: investigate tests failures on deploy
  if ((global as any).isNextDeploy) {
    it('should skip temporarily', () => {})
    return
  }

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

  describe('Redirect to locale from context', () => {
    test.each`
      path                       | locale
      ${'gssp-redirect'}         | ${'en'}
      ${'gssp-redirect'}         | ${'sv'}
      ${'gsp-blocking-redirect'} | ${'en'}
      ${'gsp-blocking-redirect'} | ${'sv'}
      ${'gsp-fallback-redirect'} | ${'en'}
      ${'gsp-fallback-redirect'} | ${'sv'}
    `('$path $locale', async ({ path, locale }) => {
      const browser = await webdriver(next.url, `/${locale}/${path}/from-ctx`)

      await check(
        () => browser.eval('window.location.pathname'),
        `/${locale}/home`
      )
      expect(await browser.elementByCss('#router-locale').text()).toBe(locale)
      expect(await browser.elementByCss('#router-pathname').text()).toBe(
        '/home'
      )
      expect(await browser.elementByCss('#router-as-path').text()).toBe('/home')
    })

    test.each`
      path                       | locale
      ${'gssp-redirect'}         | ${'en'}
      ${'gssp-redirect'}         | ${'sv'}
      ${'gsp-blocking-redirect'} | ${'en'}
      ${'gsp-blocking-redirect'} | ${'sv'}
      ${'gsp-fallback-redirect'} | ${'en'}
      ${'gsp-fallback-redirect'} | ${'sv'}
    `('next/link $path $locale', async ({ path, locale }) => {
      const browser = await webdriver(next.url, `/${locale}`)
      await browser.eval('window.beforeNav = 1')

      await browser.elementByCss(`#to-${path}-from-ctx`).click()

      await check(
        () => browser.eval('window.location.pathname'),
        `/${locale}/home`
      )

      expect(await browser.eval('window.beforeNav')).toBe(1)
      expect(await browser.elementByCss('#router-locale').text()).toBe(locale)
      expect(await browser.elementByCss('#router-pathname').text()).toBe(
        '/home'
      )
      expect(await browser.elementByCss('#router-as-path').text()).toBe('/home')
    })
  })
})
