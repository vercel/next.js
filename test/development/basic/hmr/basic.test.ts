import {
  assertHasRedbox,
  getBrowserBodyText,
  retry,
  waitFor,
} from 'next-test-utils'
import { createNext, nextTestSetup } from 'e2e-utils'
import type { NextConfig } from 'next'

describe.each([
  { basePath: '', assetPrefix: '' },
  { basePath: '', assetPrefix: '/asset-prefix' },
  { basePath: '/docs', assetPrefix: '' },
  { basePath: '/docs', assetPrefix: '/asset-prefix' },
])('basic HMR, nextConfig: %o', (nextConfig: Partial<NextConfig>) => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig,
    patchFileDelay: 500,
  })
  const { basePath } = nextConfig

  it('should have correct router.isReady for auto-export page', async () => {
    let browser = await next.browser(basePath + '/auto-export-is-ready')

    expect(await browser.elementByCss('#ready').text()).toBe('yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})

    browser = await next.browser(basePath + '/auto-export-is-ready?hello=world')

    await retry(async () => {
      expect(await browser.elementByCss('#ready').text()).toBe('yes')
    })
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      hello: 'world',
    })
  })

  it('should have correct router.isReady for getStaticProps page', async () => {
    let browser = await next.browser(basePath + '/gsp-is-ready')

    expect(await browser.elementByCss('#ready').text()).toBe('yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})

    browser = await next.browser(basePath + '/gsp-is-ready?hello=world')

    await retry(async () => {
      expect(await browser.elementByCss('#ready').text()).toBe('yes')
    })
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      hello: 'world',
    })
  })

  it('should have correct compile timing after fixing error', async () => {
    const pageName = 'pages/auto-export-is-ready.js'
    const originalContent = await next.readFile(pageName)

    try {
      const browser = await next.browser(basePath + '/auto-export-is-ready')
      const outputLength = next.cliOutput.length
      await next.patchFile(
        pageName,
        `import hello from 'non-existent'\n` + originalContent
      )
      await assertHasRedbox(browser)
      await waitFor(3000)
      await next.patchFile(pageName, originalContent)
      await retry(async () => {
        expect(next.cliOutput.substring(outputLength)).toMatch(/Compiled.*?/i)
      })
      const compileTimeStr = next.cliOutput.substring(outputLength)

      const matches = [
        ...compileTimeStr.match(/Compiled.*? in ([\d.]{1,})\s?(?:s|ms)/i),
      ]
      const [, compileTime, timeUnit] = matches

      let compileTimeMs = parseFloat(compileTime)
      if (timeUnit === 's') {
        compileTimeMs = compileTimeMs * 1000
      }
      expect(compileTimeMs).toBeLessThan(3000)
    } finally {
      await next.patchFile(pageName, originalContent)
    }
  })

  it('should reload the page when the server restarts', async () => {
    const browser = await next.browser(basePath + '/hmr/about')
    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })

    await next.destroy()

    let reloadPromise = new Promise((resolve) => {
      browser.on('request', (req) => {
        if (req.url().endsWith('/hmr/about')) {
          resolve(req.url())
        }
      })
    })

    const secondNext = await createNext({
      files: __dirname,
      nextConfig,
      forcedPort: next.appPort,
    })

    await reloadPromise
    await secondNext.destroy()
  })
})
