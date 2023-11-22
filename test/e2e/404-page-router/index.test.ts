import path from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { check } from 'next-test-utils'
import { type NextInstance } from 'test/lib/next-modes/base'

const pathnames = {
  '/404': ['/not/a/real/page?with=query', '/not/a/real/page'],
  // Special handling is done for the error cases because these need to be
  // prefixed with the basePath if it's enabled for that test suite. These also
  // should only run when the application is tested in production.
  '/_error': ['/error?with=query', '/error'],
}

const basePath = '/docs'

const table = [
  { basePath: false, i18n: true, middleware: false },
  { basePath: true, i18n: false, middleware: false },
  { basePath: true, i18n: true, middleware: false },
  { basePath: false, i18n: false, middleware: false },

  ...((global as any).isNextDev
    ? []
    : [
        // TODO: investigate this failure in development
        { basePath: false, i18n: false, middleware: true },
      ]),
]

const baseNextConfig = `
module.exports = {
  BASE_PATH
  I18N
}
`

describe('404-page-router', () => {
  let next: NextInstance

  beforeAll(async () => {
    const files = {
      pages: new FileRef(path.join(__dirname, 'app/pages')),
      components: new FileRef(path.join(__dirname, 'app/components')),
    }
    next = await createNext({ files, skipStart: true })
  })
  afterAll(() => next.destroy())

  describe.each(table)(
    '404-page-router with basePath of $basePath and i18n of $i18n and middleware $middleware',
    (options) => {
      const isDev = (global as any).isNextDev

      if ((global as any).isNextDeploy) {
        // TODO: investigate condensing these tests to avoid
        // 5 separate deploys for this one test
        it('should skip for deploy', () => {})
        return
      }

      beforeAll(async () => {
        // Only add in the middleware if we're testing with middleware enabled.
        if (options.middleware) {
          await next.patchFile(
            'middleware.js',
            await fs.readFile(
              path.join(__dirname, 'app', 'middleware.js'),
              'utf8'
            )
          )
        }

        let curNextConfig = baseNextConfig
          .replace('BASE_PATH', options.basePath ? "basePath: '/docs'," : '')
          .replace(
            'I18N',
            options.i18n
              ? "i18n: { defaultLocale: 'en-ca', locales: ['en-ca', 'en-fr'] },"
              : ''
          )

        await next.patchFile('next.config.js', curNextConfig)
        await next.start()
      })
      afterAll(async () => {
        await next.stop()
        await next.deleteFile('middleware.js')
      })

      /**
       * translate will iterate over the pathnames and generate the test cases
       * used in the following table test.
       *
       * @param pathname key for the pathname to iterate over
       * @param shouldPrefixPathname true if the url's should be prefixed with the basePath
       * @returns test cases
       */
      function translate(
        pathname: keyof typeof pathnames,
        shouldPrefixPathname: boolean = false
      ): { url: string; pathname: keyof typeof pathnames; asPath: string }[] {
        return pathnames[pathname].map((asPath) => ({
          // Prefix the request URL with the basePath if enabled.
          url: shouldPrefixPathname ? basePath + asPath : asPath,
          // The pathname is not prefixed with the basePath.
          pathname,
          // The asPath is not prefixed with the basePath.
          asPath,
        }))
      }

      // Always include the /404 tests, they'll run the same in development and
      // production environments.
      const urls = translate('/404')

      // Only include the /_error tests in production because in development we
      // have the error overlay.
      if (!isDev) {
        urls.push(...translate('/_error', options.basePath))
      }

      describe.each(urls)('for $url', ({ url, pathname, asPath }) => {
        it('should have the correct router parameters after it is ready', async () => {
          const query = url.split('?', 2)[1] ?? ''
          const browser = await webdriver(next.url, url)

          try {
            await check(
              () => browser.eval('next.router.isReady ? "yes" : "no"'),
              'yes'
            )
            expect(await browser.elementById('pathname').text()).toEqual(
              pathname
            )
            expect(await browser.elementById('asPath').text()).toEqual(asPath)
            expect(await browser.elementById('query').text()).toEqual(query)
          } finally {
            await browser.close()
          }
        })
      })

      // It should not throw any errors when re-fetching the route info:
      // https://github.com/vercel/next.js/issues/44293
      it('should not throw any errors when re-fetching the route info', async () => {
        const browser = await webdriver(next.url, '/?test=1')
        await check(
          () => browser.eval('next.router.isReady ? "yes" : "no"'),
          'yes'
        )
        expect(await browser.elementById('query').text()).toEqual('test=1')
      })
    }
  )
})
