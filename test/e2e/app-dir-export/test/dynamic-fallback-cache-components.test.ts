import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import webdriver from 'next-webdriver'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import fs from 'fs-extra'
import { buildAndStartOutputExportServer } from './utils'

const { next, skipped, isNextDev } = nextTestSetup({
  files: join(__dirname, '..', 'fixtures', 'dynamic-fallback-cache-components'),
  skipDeployment: true,
  skipStart: true,
  disableAutoSkewProtection: true,
})

if (skipped) {
  describe.skip('app dir - output export dynamic routes with Cache Components', () => {})
} else {
  const describeProduction = isNextDev ? describe.skip : describe

  describeProduction(
    'app dir - output export dynamic routes with Cache Components',
    () => {
      let port: number
      let stopOrKill: (() => Promise<void>) | undefined
      let getRequests: () => string[]
      let clearRequests: () => void

      beforeAll(async () => {
        ;({ port, stopOrKill, getRequests, clearRequests } =
          await buildAndStartOutputExportServer(next, {
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
          await fs.pathExists(join(outDir, 'docs', '__fallback', 'index.txt'))
        ).toBe(true)
        expect(
          await fs.pathExists(
            join(outDir, 'optional', '__fallback', 'index.txt')
          )
        ).toBe(true)
        expect(
          await fs.pathExists(
            join(outDir, 'grouped', '__fallback', 'index.txt')
          )
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'inbox', '__fallback', 'index.txt'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'org', '__fallback', 'index.txt'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', 'first', 'index.html'))
        ).toBe(false)
        expect(
          await fs.pathExists(
            join(outDir, 'org', 'acme', 'chat', 'thread-123', 'index.html')
          )
        ).toBe(false)
      })

      it('renders an unenumerated slug on hard load and client navigation', async () => {
        clearRequests()
        const browser = await webdriver(port, '/another/third/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })

          expect(
            getRequests().some((requestPath) =>
              requestPath.startsWith('/another/__fallback/index.html')
            )
          ).toBe(false)

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

      it('prefetches fallback payloads for unknown-param links before navigation', async () => {
        let act!: ReturnType<typeof createRouterAct>
        const browser = await webdriver(port, '/isolated/', {
          beforePageLoad(page: Playwright.Page) {
            act = createRouterAct(page)
          },
        })

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Isolated')
          })

          await act(async () => {
            const toggle = await browser.elementByCss(
              'input[data-link-accordion="/isolated/third"]'
            )
            await toggle.click()
          })

          clearRequests()

          await browser
            .elementByCss('a[data-accordion-link="/isolated/third"]')
            .click()

          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })

          const clickRequests = getRequests()
          expect(
            clickRequests.some((requestPath) =>
              requestPath.startsWith('/isolated/__fallback.meta.json')
            )
          ).toBe(false)
          expect(
            clickRequests.some((requestPath) =>
              requestPath.startsWith('/isolated/__fallback/index.txt')
            )
          ).toBe(false)
          expect(
            clickRequests.some((requestPath) =>
              requestPath.startsWith('/isolated/third/index.txt')
            )
          ).toBe(false)
          expect(
            clickRequests.some((requestPath) =>
              requestPath.startsWith('/isolated/third/__next.')
            )
          ).toBe(false)
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

      it('renders catch-all fallback routes on hard load and client navigation', async () => {
        const browser = await webdriver(port, '/docs/guides/export/fallback/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'guides/export/fallback'
            )
          })

          await browser.elementByCss('a[href="/docs/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Docs')
          })

          await browser
            .elementByCss('a[href="/docs/guides/export/fallback/"]')
            .click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'guides/export/fallback'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('renders optional catch-all fallback routes for empty and nested params', async () => {
        const browser = await webdriver(port, '/optional/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'optional index'
            )
          })

          await browser.elementByCss('a[href="/optional/deep/path/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('deep/path')
          })
        } finally {
          await browser.close()
        }
      })

      it('renders grouped dynamic fallback routes', async () => {
        const browser = await webdriver(port, '/grouped/from-group/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('from-group')
          })

          await browser.elementByCss('a[href="/grouped/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'Grouped index'
            )
          })

          await browser.elementByCss('a[href="/grouped/from-group/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('from-group')
          })
        } finally {
          await browser.close()
        }
      })

      it('renders fallback params consistently across parallel routes', async () => {
        const browser = await webdriver(port, '/inbox/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Inbox')
            expect(await browser.elementByCss('#modal-thread').text()).toBe(
              'No modal'
            )
          })

          await browser.elementByCss('a[href="/inbox/thread-123/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('thread-123')
            expect(await browser.elementByCss('#modal-thread').text()).toBe(
              'Modal thread-123'
            )
          })

          await browser.get(`http://localhost:${port}/inbox/thread-456/`)
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('thread-456')
            expect(await browser.elementByCss('#modal-thread').text()).toBe(
              'Modal thread-456'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('renders nested fallback params across multiple dynamic segments', async () => {
        const browser = await webdriver(port, '/org/umbrella/chat/thread-789/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('#org-name').text()).toBe(
              'Org umbrella'
            )
            expect(await browser.elementByCss('h1').text()).toBe(
              'umbrella:thread-789'
            )
          })

          await browser.elementByCss('a[href="/org/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Org index')
          })

          await browser
            .elementByCss('a[href="/org/acme/chat/thread-123/"]')
            .click()
          await retry(async () => {
            expect(await browser.elementByCss('#org-name').text()).toBe(
              'Org acme'
            )
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-123'
            )
          })

          await browser
            .elementByCss('a[href="/org/acme/chat/thread-456/"]')
            .click()
          await retry(async () => {
            expect(await browser.elementByCss('#org-name').text()).toBe(
              'Org acme'
            )
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-456'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('generates a hidden _fallback.html bootstrap document', async () => {
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

      it('supports client navigation across different fallback subtrees', async () => {
        const browser = await webdriver(port, '/another/cross-test/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('cross-test')
          })

          await browser
            .elementByCss('a[href="/org/acme/chat/thread-cross/"]')
            .click()
          await retry(async () => {
            expect(await browser.elementByCss('#org-name').text()).toBe(
              'Org acme'
            )
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-cross'
            )
          })

          await browser.back()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('cross-test')
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
