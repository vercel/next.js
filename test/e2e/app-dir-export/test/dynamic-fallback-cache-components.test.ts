import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import webdriver from 'next-webdriver'
import fs from 'fs-extra'
import { buildAndStartOutputExportServer } from './utils'

const { next, skipped, isNextDev } = nextTestSetup({
  files: join(__dirname, '..', 'fixtures', 'dynamic-fallback-cache-components'),
  skipDeployment: true,
  skipStart: true,
  disableAutoSkewProtection: true,
})

if (skipped) {
  it('skips unsupported mode', () => {})
} else {
  const describeProduction = isNextDev ? describe.skip : describe

  describeProduction(
    'app dir - output export dynamic routes with Cache Components',
    () => {
      let port: number
      let stopOrKill: (() => Promise<void>) | undefined

      beforeAll(async () => {
        ;({ port, stopOrKill } = await buildAndStartOutputExportServer(next, {
          trailingSlash: true,
          useFallbackDocument: true,
        }))
      })

      afterAll(async () => {
        if (stopOrKill) {
          await stopOrKill()
        }
        await next.destroy()
      })

      it('writes fallback artifacts instead of per-param prerenders', async () => {
        const outDir = join(next.testDir, 'out')

        expect(await fs.pathExists(join(outDir, '_fallback.html'))).toBe(true)
        expect(
          await fs.readFile(join(outDir, '_fallback.html'), 'utf8')
        ).toContain('__NEXT_EXPORT_FALLBACK=1')
        expect(
          await fs.pathExists(
            join(outDir, 'another', '__fallback', 'index.html')
          )
        ).toBe(true)
        expect(
          await fs.pathExists(
            join(outDir, 'another', '__fallback', 'index.txt')
          )
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', 'first', 'index.html'))
        ).toBe(false)
      })

      it('renders an unenumerated slug on hard load and client navigation', async () => {
        const browser = await webdriver(port, '/another/third/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })

          await browser.elementByCss('a[href="/another/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Another')
          })

          await browser.elementByCss('a[href="/another/third/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })
        } finally {
          await browser.close()
        }
      })

      it('renders the app not-found page when no fallback route matches', async () => {
        const browser = await webdriver(port, '/missing/route/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'My custom not found page'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('generates _fallback.html from a PPR shell instead of index.html', async () => {
        const outDir = join(next.testDir, 'out')
        const fallbackHtml = await fs.readFile(
          join(outDir, '_fallback.html'),
          'utf8'
        )

        expect(fallbackHtml).toContain('__NEXT_EXPORT_FALLBACK=1')
        expect(fallbackHtml).not.toContain('>Home<')
        expect(fallbackHtml).toContain('__next-export-fallback-style')
      })

      it('supports browser back/forward between fallback routes', async () => {
        const browser = await webdriver(port, '/another/slug-a/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('slug-a')
          })

          await browser.elementByCss('a[href="/another/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Another')
          })

          await browser.back()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('slug-a')
          })

          await browser.forward()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Another')
          })
        } finally {
          await browser.close()
        }
      })

      it('handles consecutive hard navigations to different params', async () => {
        const browser = await webdriver(port, '/another/param-one/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('param-one')
          })

          await browser.get(`http://localhost:${port}/another/param-two/`)
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('param-two')
          })

          await browser.get(`http://localhost:${port}/another/param-three/`)
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('param-three')
          })
        } finally {
          await browser.close()
        }
      })

      it('preserves search params and hash across fallback hard loads', async () => {
        const browser = await webdriver(
          port,
          '/another/query-param/?tab=notes#anchor'
        )

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('query-param')
            expect(
              await browser.eval(
                'window.location.pathname + window.location.search + window.location.hash'
              )
            ).toBe('/another/query-param/?tab=notes#anchor')
          })
        } finally {
          await browser.close()
        }
      })

      it('supports a longer history sequence across static and fallback routes', async () => {
        const browser = await webdriver(port, '/another/history-one/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('history-one')
          })

          await browser.elementByCss('a[href="/another/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Another')
          })

          await browser.elementByCss('a[href="/another/third/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })

          await browser.back()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Another')
          })

          await browser.back()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('history-one')
          })

          await browser.forward()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Another')
          })

          await browser.forward()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })
        } finally {
          await browser.close()
        }
      })

      it('shows Suspense fallback UI during hard load of a fallback route', async () => {
        const browser = await webdriver(port, '/another/suspense-test/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'suspense-test'
            )
          })

          const html = await browser.eval('document.documentElement.innerHTML')
          expect(html).not.toContain('Loading slug...')
        } finally {
          await browser.close()
        }
      })
    }
  )
}
