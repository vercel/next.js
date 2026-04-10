import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import webdriver from 'next-webdriver'
import fs from 'fs-extra'
import { buildAndStartOutputExportServer } from './utils'

const { next, skipped, isNextDev } = nextTestSetup({
  files: join(
    __dirname,
    '..',
    'fixtures',
    'dynamic-fallback-cache-components-flat'
  ),
  skipDeployment: true,
  skipStart: true,
  disableAutoSkewProtection: true,
})

if (skipped) {
  describe.skip('app dir - output export dynamic routes with Cache Components without trailing slashes', () => {})
} else {
  const describeProduction = isNextDev ? describe.skip : describe

  describeProduction(
    'app dir - output export dynamic routes with Cache Components without trailing slashes',
    () => {
      let port: number
      let stopOrKill: (() => Promise<void>) | undefined

      beforeAll(async () => {
        ;({ port, stopOrKill } = await buildAndStartOutputExportServer(next, {
          trailingSlash: false,
          useFallbackDocument: true,
        }))
      })

      afterAll(async () => {
        if (stopOrKill) {
          await stopOrKill()
        }
        await next.destroy()
      })

      it('writes flat fallback artifacts for trailingSlash false', async () => {
        const outDir = join(next.testDir, 'out')

        expect(await fs.pathExists(join(outDir, '_fallback.html'))).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', '__fallback.html'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', '__fallback.txt'))
        ).toBe(true)
        expect(await fs.pathExists(join(outDir, 'org', '__fallback.txt'))).toBe(
          true
        )
        expect(
          await fs.pathExists(
            join(outDir, 'another', '__fallback', 'index.html')
          )
        ).toBe(false)
      })

      it('renders an unenumerated slug on hard load and client navigation without adding a trailing slash', async () => {
        const browser = await webdriver(port, '/another/third')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
            expect(await browser.eval('window.location.pathname')).toBe(
              '/another/third'
            )
          })

          await browser.elementByCss('a[href="/another"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Another')
            expect(await browser.eval('window.location.pathname')).toBe(
              '/another'
            )
          })

          await browser.elementByCss('a[href="/another/third"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
            expect(await browser.eval('window.location.pathname')).toBe(
              '/another/third'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('preserves search params and hash for nested fallback routes without trailing slashes', async () => {
        const browser = await webdriver(
          port,
          '/org/umbrella/chat/thread-flat?view=full#messages'
        )

        try {
          await retry(async () => {
            expect(await browser.elementByCss('#org-name').text()).toBe(
              'Org umbrella'
            )
            expect(await browser.elementByCss('h1').text()).toBe(
              'umbrella:thread-flat'
            )
            expect(
              await browser.eval(
                'window.location.pathname + window.location.search + window.location.hash'
              )
            ).toBe('/org/umbrella/chat/thread-flat?view=full#messages')
          })
        } finally {
          await browser.close()
        }
      })
    }
  )
}
