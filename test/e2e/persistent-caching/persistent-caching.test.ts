import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

describe('persistent-caching', () => {
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
      await next.build()
    }
    await next.start()
  }

  it('should persistent cache loaders', async () => {
    let appTimestamp, pagesTimestamp
    {
      const browser = await next.browser('/')
      appTimestamp = await browser.elementByCss('main').text()
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
      // TODO Persistent Caching for webpack dev server is broken
      expect(await browser.elementByCss('main').text()).toBe(appTimestamp)
      await browser.close()
    }
    {
      const browser = await next.browser('/pages')
      // TODO Persistent Caching for webpack dev server is broken
      expect(await browser.elementByCss('main').text()).toBe(pagesTimestamp)
      await browser.close()
    }
  })

  it('should allow to change files while stopped', async () => {
    {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toBe('hello world')
      await browser.close()
    }
    {
      const browser = await next.browser('/pages')
      expect(await browser.elementByCss('p').text()).toBe('hello world')
      await browser.close()
    }

    await stop()

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
            await start()
            {
              const browser = await next.browser('/')
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
            await stop()
          }
        )
      }
    )
    await start()
  })
})
