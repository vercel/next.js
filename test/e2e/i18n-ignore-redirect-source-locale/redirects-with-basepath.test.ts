import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'

const locales = ['', '/en', '/sv', '/nl']

describe('i18n-ignore-redirect-source-locale with basepath', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
      },
      dependencies: {},
      nextConfig: {
        basePath: '/basepath',
        i18n: {
          locales: ['en', 'sv', 'nl'],
          defaultLocale: 'en',
        },
        async redirects() {
          return [
            {
              source: '/:locale/to-sv',
              destination: '/sv/newpage',
              permanent: false,
              locale: false,
            },
            {
              source: '/:locale/to-en',
              destination: '/en/newpage',
              permanent: false,
              locale: false,
            },
            {
              source: '/:locale/to-slash',
              destination: '/newpage',
              permanent: false,
              locale: false,
            },
            {
              source: '/:locale/to-same',
              destination: '/:locale/newpage',
              permanent: false,
              locale: false,
            },
          ]
        },
      },
    })
  })
  afterAll(() => next.destroy())

  test.each(locales)(
    'get redirected to the new page, from: %s to: sv',
    async (locale) => {
      const browser = await webdriver(next.url, `basepath/${locale}/to-sv`)
      await retry(async () => {
        expect(await browser.elementById('current-locale').text()).toBe('sv')
      })
    }
  )

  test.each(locales)(
    'get redirected to the new page, from: %s to: en',
    async (locale) => {
      const browser = await webdriver(next.url, `basepath/${locale}/to-en`)
      await retry(async () => {
        expect(await browser.elementById('current-locale').text()).toBe('en')
      })
    }
  )

  test.each(locales)(
    'get redirected to the new page, from: %s to: /',
    async (locale) => {
      const browser = await webdriver(next.url, `basepath/${locale}/to-slash`)
      await retry(async () => {
        expect(await browser.elementById('current-locale').text()).toBe('en')
      })
    }
  )

  test.each(locales)(
    'get redirected to the new page, from and to: %s',
    async (locale) => {
      const browser = await webdriver(next.url, `basepath/${locale}/to-same`)
      await retry(async () => {
        expect(await browser.elementById('current-locale').text()).toBe(
          locale === '' ? 'en' : locale.slice(1)
        )
      })
    }
  )
})
