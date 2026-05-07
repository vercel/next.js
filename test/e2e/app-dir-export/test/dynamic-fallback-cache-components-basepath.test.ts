import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { buildAndStartOutputExportServer } from './utils'

const { next, skipped, isNextDev } = nextTestSetup({
  files: join(__dirname, '..', 'fixtures', 'dynamic-fallback-cache-components'),
  skipDeployment: true,
  skipStart: true,
  disableAutoSkewProtection: true,
})

if (skipped) {
  describe.skip('app dir - output export dynamic routes with Cache Components and basePath', () => {})
} else {
  const describeProduction = isNextDev ? describe.skip : describe

  describeProduction(
    'app dir - output export dynamic routes with Cache Components and basePath',
    () => {
      let port: number
      let stopOrKill: (() => Promise<void>) | undefined
      let getRequests: () => string[]
      let clearRequests: () => void

      beforeAll(async () => {
        await next.patchFile('next.config.js', (content) =>
          content.replace(
            'cacheComponents: true,',
            "cacheComponents: true,\n  basePath: '/base',"
          )
        )
        ;({ port, stopOrKill, getRequests, clearRequests } =
          await buildAndStartOutputExportServer(next, {
            basePath: '/base',
            useFallbackDocument: true,
          }))
      })

      afterAll(async () => {
        await stopOrKill?.()
        await next.destroy()
      })

      it('renders an unenumerated dynamic route after removing basePath from fallback params', async () => {
        const browser = await webdriver(port, '/base/another/third/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
            expect(await browser.eval('window.location.pathname')).toBe(
              '/base/another/third/'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('client navigates to an unenumerated dynamic route under the basePath', async () => {
        const browser = await webdriver(port, '/base/another/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Another')
            expect(await browser.eval('window.location.pathname')).toBe(
              '/base/another/'
            )
          })

          await browser.elementByCss('a[href^="/base/another/third"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
            expect(await browser.eval('window.location.pathname')).toBe(
              '/base/another/third/'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('keeps unmatched fallback not-found fetches under the basePath', async () => {
        clearRequests()
        const browser = await webdriver(port, '/base/missing/route/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'My custom not found page'
            )
          })

          const requests = getRequests()
          expect(
            requests.some((requestPath) =>
              requestPath.startsWith('/base/_not-found/index.txt')
            )
          ).toBe(true)
          expect(
            requests.some((requestPath) =>
              requestPath.startsWith('/_not-found.txt')
            )
          ).toBe(false)
        } finally {
          await browser.close()
        }
      })
    }
  )
}
