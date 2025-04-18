import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'

describe('persistent-caching', () => {
  process.env.NEXT_DEPLOYMENT_ID = '' + Date.now()
  const { skipped, next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  async function restartCycle(browser: Playwright) {
    await stop()
    await start()
    // TODO: handle changed ports automatically when restarting the server
    browser.setBaseUrl(next.url)
  }

  async function stop() {
    if (isNextDev) {
      // Give Persistent Cache time to write to disk
      await waitFor(10000)
    }
    await next.stop()
  }

  async function start() {
    if (!isNextDev) {
      // TODO workaround for missing content hashing on output static files
      // Browser caching would break this test case, but we want to test persistent caching.
      process.env.NEXT_DEPLOYMENT_ID = '' + Date.now()
    }
    await next.start()
  }

  it('should persistent cache loaders', async () => {
    const browser = await next.browser('/')

    const appTimestamp = await browser.elementByCss('main').text()

    await browser.get('/client')
    const appClientTimestamp = await browser.elementByCss('main').text()

    await browser.get('/pages')
    const pagesTimestamp = await browser.elementByCss('main').text()

    await restartCycle(browser)

    await browser.get('/')
    // TODO Persistent Caching for webpack dev server is broken
    expect(await browser.elementByCss('main').text()).toBe(appTimestamp)

    await browser.get('/client')
    // TODO Persistent Caching for webpack dev server is broken
    expect(await browser.elementByCss('main').text()).toBe(appClientTimestamp)

    await browser.get('/pages')
    // TODO Persistent Caching for webpack dev server is broken
    expect(await browser.elementByCss('main').text()).toBe(pagesTimestamp)
  })

  it.each([1, 2, 3])(
    'should allow to change files while stopped (run %d)',
    async (_i) => {
      // TODO: is navigating to this page before the first assertion (which navigates to it again) valid?
      const browser = await next.browser('/', { waitHydration: false })

      async function checkInitial() {
        await browser.get('/')
        expect(await browser.elementByCss('p').text()).toBe('hello world')

        await browser.get('/client')
        expect(await browser.elementByCss('p').text()).toBe('hello world')

        await browser.get('/pages')
        expect(await browser.elementByCss('p').text()).toBe('hello world')

        await browser.get('/remove-me')
        expect(await browser.elementByCss('p').text()).toBe('hello world')
      }

      await checkInitial()

      await stop()

      async function checkChanges() {
        await browser.get('/')
        expect(await browser.elementByCss('p').text()).toBe(
          'hello persistent caching'
        )

        await browser.get('/client')
        expect(await browser.elementByCss('p').text()).toBe(
          'hello persistent caching'
        )

        await browser.get('/pages')
        expect(await browser.elementByCss('p').text()).toBe(
          'hello persistent caching'
        )

        await browser.get('/add-me')
        expect(await browser.elementByCss('p').text()).toBe('hello world')
        await browser.close()
      }

      await next.patchFile(
        'pages/pages.tsx',
        (content) => {
          return content.replace('hello world', 'hello persistent caching')
        },
        async () => {
          await next.patchFile(
            'app/page.tsx',
            (content) => {
              return content.replace('hello world', 'hello persistent caching')
            },
            async () => {
              await next.patchFile(
                'app/client/page.tsx',
                (content) => {
                  return content.replace(
                    'hello world',
                    'hello persistent caching'
                  )
                },
                async () => {
                  await next.renameFolder('app/remove-me', 'app/add-me')
                  try {
                    await start()
                    await checkChanges()
                    // Some no-op change builds
                    for (let i = 0; i < 2; i++) {
                      await restartCycle(browser)
                      await checkChanges()
                    }
                    await stop()
                  } finally {
                    await next.renameFolder('app/add-me', 'app/remove-me')
                  }
                }
              )
            }
          )
        }
      )
      await start()
    }
  )
})
