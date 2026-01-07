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

  describe('Redirect to another locale', () => {
    test.each`
      path                       | fromLocale | toLocale
      ${'gssp-redirect'}         | ${'en'}    | ${'sv'}
      ${'gssp-redirect'}         | ${'sv'}    | ${'en'}
      ${'gsp-blocking-redirect'} | ${'en'}    | ${'sv'}
      ${'gsp-blocking-redirect'} | ${'sv'}    | ${'en'}
      ${'gsp-fallback-redirect'} | ${'en'}    | ${'sv'}
      ${'gsp-fallback-redirect'} | ${'sv'}    | ${'en'}
    `(
      '$path $fromLocale -> $toLocale',
      async ({ path, fromLocale, toLocale }) => {
        const browser = await webdriver(
          next.url,
          `/${fromLocale}/${path}/${toLocale}`
        )

        await check(
          () => browser.eval('window.location.pathname'),
          `/${toLocale}/home`
        )
        expect(await browser.elementByCss('#router-locale').text()).toBe(
          toLocale
        )
        expect(await browser.elementByCss('#router-pathname').text()).toBe(
          '/home'
        )
        expect(await browser.elementByCss('#router-as-path').text()).toBe(
          '/home'
        )
      }
    )

    test.each`
      path                       | fromLocale | toLocale
      ${'gssp-redirect'}         | ${'en'}    | ${'sv'}
      ${'gssp-redirect'}         | ${'sv'}    | ${'en'}
      ${'gsp-blocking-redirect'} | ${'en'}    | ${'sv'}
      ${'gsp-blocking-redirect'} | ${'sv'}    | ${'en'}
      ${'gsp-fallback-redirect'} | ${'en'}    | ${'sv'}
      ${'gsp-fallback-redirect'} | ${'sv'}    | ${'en'}
    `(
      'next/link $path $fromLocale -> $toLocale',
      async ({ path, fromLocale, toLocale }) => {
        const browser = await webdriver(next.url, `/${fromLocale}`)
        await browser.eval('window.beforeNav = 1')

        await browser.elementByCss(`#to-${path}-${toLocale}`).click()

        await check(
          () => browser.eval('window.location.pathname'),
          `/${toLocale}/home`
        )

        expect(await browser.eval('window.beforeNav')).toBe(1)
        expect(await browser.elementByCss('#router-locale').text()).toBe(
          toLocale
        )
        expect(await browser.elementByCss('#router-pathname').text()).toBe(
          '/home'
        )
        expect(await browser.elementByCss('#router-as-path').text()).toBe(
          '/home'
        )
      }
    )
  })
})
