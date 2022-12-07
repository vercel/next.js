import { createNext, FileRef } from 'e2e-utils'
import path from 'path'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'

const basePath = '/docs'
const i18n = { defaultLocale: 'en-ca', locales: ['en-ca', 'en-fr'] }

const table = [
  // Including the i18n and no basePath
  { basePath: undefined, i18n, middleware: false },
  // Including the basePath and no i18n
  { basePath, i18n: undefined, middleware: false },
  // Including both i18n and basePath
  { basePath, i18n, middleware: false },
  // Including no basePath or i18n
  { basePath: undefined, i18n: undefined, middleware: false },
  // Including middleware.
  { basePath: undefined, i18n: undefined, middleware: true },
]

describe.each(table)(
  '404-page-router with basePath of $basePath and i18n of $i18n and middleware %middleware',
  ({ middleware, ...nextConfig }) => {
    let next: NextInstance

    beforeAll(async () => {
      const files = {
        pages: new FileRef(path.join(__dirname, 'app/pages')),
      }

      if (middleware) {
        files['middleware.js'] = new FileRef(
          path.join(__dirname, 'app/middleware.js')
        )
      }

      next = await createNext({
        files,
        nextConfig,
      })
    })

    afterAll(() => next.destroy())

    describe.each(['/not/a/real/page?with=query', '/not/a/real/page'])(
      'for url %s',
      (url) => {
        it('should have the correct router parameters after it is ready', async () => {
          const query = url.split('?')[1] ?? ''
          const browser = await webdriver(next.url, url)

          try {
            await browser.waitForCondition(
              'document.getElementById("isReady")?.innerText === "true"'
            )

            expect(await browser.elementById('pathname').text()).toEqual('/404')
            expect(await browser.elementById('asPath').text()).toEqual(url)
            expect(await browser.elementById('query').text()).toEqual(query)
          } finally {
            await browser.close()
          }
        })
      }
    )
  }
)
