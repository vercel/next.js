import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

describe('persistent-caching', () => {
  process.env.NEXT_DEPLOYMENT_ID = '' + Date.now()
  const { skipped, next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  async function restartCycle() {
    await stop()
    await start()
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
    let appTimestamp, appClientTimestamp, pagesTimestamp
    {
      const browser = await next.browser('/')
      appTimestamp = await browser.elementByCss('main').text()
      await browser.close()
    }
    {
      const browser = await next.browser('/client')
      appClientTimestamp = await browser.elementByCss('main').text()
      await browser.close()
    }
    {
      const browser = await next.browser('/pages')
      pagesTimestamp = await browser.elementByCss('main').text()
      await browser.close()
    }
    await restartCycle()

    {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('main').text()).toBe(appTimestamp)
      await browser.close()
    }
    {
      const browser = await next.browser('/client')
      expect(await browser.elementByCss('main').text()).toBe(appClientTimestamp)
      await browser.close()
    }
    {
      const browser = await next.browser('/pages')
      expect(await browser.elementByCss('main').text()).toBe(pagesTimestamp)
      await browser.close()
    }
  })

  it.each([1, 2, 3])(
    'should allow to change files while stopped (run %d)',
    async (_i) => {
      async function checkInitial() {
        {
          const browser = await next.browser('/')
          expect(await browser.elementByCss('p').text()).toBe('hello world')
          await browser.close()
        }
        {
          const browser = await next.browser('/client')
          expect(await browser.elementByCss('p').text()).toBe('hello world')
          await browser.close()
        }
        {
          const browser = await next.browser('/pages')
          expect(await browser.elementByCss('p').text()).toBe('hello world')
          await browser.close()
        }
        {
          const browser = await next.browser('/remove-me')
          expect(await browser.elementByCss('p').text()).toBe('hello world')
          await browser.close()
        }
      }

      await checkInitial()

      await stop()

      async function checkChanges() {
        {
          const browser = await next.browser('/')
          expect(await browser.elementByCss('p').text()).toBe(
            'hello persistent caching'
          )
          await browser.close()
        }
        {
          const browser = await next.browser('/client')
          expect(await browser.elementByCss('p').text()).toBe(
            'hello persistent caching'
          )
          await browser.close()
        }
        {
          const browser = await next.browser('/pages')
          expect(await browser.elementByCss('p').text()).toBe(
            'hello persistent caching'
          )
          await browser.close()
        }
        {
          const browser = await next.browser('/add-me')
          expect(await browser.elementByCss('p').text()).toBe('hello world')
          await browser.close()
        }
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
                      await restartCycle()
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
