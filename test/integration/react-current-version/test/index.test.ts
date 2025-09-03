/* eslint-env jest */

import { join } from 'path'

import cheerio from 'cheerio'
import {
  check,
  File,
  renderViaHTTP,
  runDevSuite,
  runProdSuite,
} from 'next-test-utils'
import webdriver, { type Playwright } from 'next-webdriver'

const appDir = join(__dirname, '../app')
const indexPage = new File(join(appDir, 'pages/index.js'))

describe('Basics', () => {
  runTests('default setting', (context, env) => {
    it('should only render once in SSR', async () => {
      await renderViaHTTP(context.appPort, '/')
      expect([...context.stdout.matchAll(/__render__/g)].length).toBe(1)
    })

    it('no warnings for image related link props', async () => {
      await renderViaHTTP(context.appPort, '/')
      expect(context.stderr).not.toContain('Warning: Invalid DOM property')
      expect(context.stderr).not.toContain('Warning: React does not recognize')
    })

    it('hydrates correctly for normal page', async () => {
      const browser = await webdriver(context.appPort, '/')
      expect(await browser.eval('window.didHydrate')).toBe(true)
      expect(await browser.elementById('react-dom-version').text()).toMatch(
        /19/
      )
    })

    it('useId() values should match on hydration', async () => {
      const html = await renderViaHTTP(context.appPort, '/use-id')
      const $ = cheerio.load(html)
      const ssrId = $('#id').text()

      const browser = await webdriver(context.appPort, '/use-id')
      const csrId = await browser.eval(
        'document.getElementById("id").innerText'
      )

      expect(ssrId).toEqual(csrId)
    })

    it('should contain dynamicIds in next data for dynamic imports', async () => {
      async function expectToContainPreload(page) {
        const html = await renderViaHTTP(context.appPort, `/${page}`)
        const $ = cheerio.load(html)
        const { dynamicIds } = JSON.parse($('#__NEXT_DATA__').html())

        if (env === 'dev') {
          expect(
            dynamicIds.find((id) =>
              process.env.IS_TURBOPACK_TEST
                ? id.endsWith(
                    'app/components/foo.js [client] (ecmascript, next/dynamic entry)'
                  )
                : id === `pages/${page}.js -> ../components/foo`
            )
          ).toBeTruthy()
        } else {
          expect(dynamicIds.length).toBe(1)
        }
      }
      await expectToContainPreload('dynamic')
    })
  })
})

function runTestsAgainstRuntime(runtime) {
  runTests(
    `Concurrent mode in the ${runtime} runtime`,
    (context) => {
      async function withBrowser(
        path: string,
        cb: (browser: Playwright) => Promise<void>
      ) {
        let browser: Playwright
        try {
          browser = await webdriver(context.appPort, path)
          await cb(browser)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      }

      it('flushes styled-jsx styles as the page renders', async () => {
        const html = await renderViaHTTP(
          context.appPort,
          '/use-flush-effect/styled-jsx'
        )
        const stylesOccurrence = html.match(/color:(\s)*(?:blue|#00f)/g) || []
        expect(stylesOccurrence.length).toBe(1)

        await withBrowser('/use-flush-effect/styled-jsx', async (browser) => {
          await check(
            () =>
              browser
                .waitForElementByCss('style#__jsx-900f996af369fc74', {
                  state: 'attached',
                })
                .text(),
            /(?:blue|#00f)/
          )
          await check(
            () =>
              browser
                .waitForElementByCss('style#__jsx-8b0811664c4e575e', {
                  state: 'attached',
                })
                .text(),
            /red/
          )
        })
      })

      describe('<RouteAnnouncer />', () => {
        it('should not have the initial route announced', async () => {
          const browser = await webdriver(context.appPort, '/')
          const title = await browser
            .waitForElementByCss('#__next-route-announcer__', {
              state: 'attached',
            })
            .text()

          expect(title).toBe('')
        })
      })

      it('should not have invalid config warning', async () => {
        await renderViaHTTP(context.appPort, '/')
        expect(context.stderr).not.toContain('not exist in this version')
      })
    },
    {
      beforeAll: (env) => {
        indexPage.replace(
          "// runtime: 'experimental-edge'",
          `runtime: '${runtime}'`
        )
      },
      afterAll: (env) => {
        indexPage.restore()
      },
    }
  )
}

runTestsAgainstRuntime('experimental-edge')
runTestsAgainstRuntime('nodejs')

function runTests(
  name: string,
  fn: (context: any, env: any) => void,
  opts?: any
) {
  const suiteOptions = { ...opts, runTests: fn }
  runDevSuite(name, appDir, suiteOptions)
  runProdSuite(name, appDir, suiteOptions)
}
