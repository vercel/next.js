import { createReadStream } from 'fs'
import http from 'http'
import { join } from 'path'
import { createNext, isNextDeploy, isNextDev, NextInstance } from 'e2e-utils'
import express from 'express'
import { findPort, retry, stopApp } from 'next-test-utils'
import webdriver from 'next-webdriver'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

async function buildAndStartOutputExportServer(next: NextInstance) {
  await next.build()

  const port = await findPort()
  const app = express()
  const server = http.createServer(app)
  const outDir = join(next.testDir, 'out')
  const fallbackHtml = join(outDir, '_fallback.html')
  const requests: string[] = []

  app.use((req, _res, nextMiddleware) => {
    requests.push(req.url)
    nextMiddleware()
  })
  app.use(
    express.static(outDir, {
      extensions: ['html'],
      redirect: false,
    })
  )
  app.use((_req, res) => {
    createReadStream(fallbackHtml).pipe(res)
  })

  await new Promise<void>((resolve) => server.listen(port, resolve))

  return {
    port,
    stopOrKill: () => stopApp(server),
    getRequests: () => [...requests],
    clearRequests: () => {
      requests.length = 0
    },
  }
}

if (isNextDeploy) {
  it('skips deploy mode', () => {})
} else {
  const describeProduction = isNextDev ? describe.skip : describe

  describeProduction(
    'app dir - output export dynamic route optimizations with Cache Components',
    () => {
      let next: NextInstance
      let port: number
      let stopOrKill: (() => Promise<void>) | undefined
      let getRequests: () => string[]
      let clearRequests: () => void

      beforeAll(async () => {
        next = await createNext({
          files: join(
            __dirname,
            '..',
            'fixtures',
            'dynamic-fallback-cache-components'
          ),
          skipStart: true,
          disableAutoSkewProtection: true,
        })
        ;({ port, stopOrKill, getRequests, clearRequests } =
          await buildAndStartOutputExportServer(next))
      })

      afterAll(async () => {
        if (stopOrKill) {
          await stopOrKill()
        }
        await next.destroy()
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

      it('dedupes fallback artifact prefetches across sibling unknown-param links', async () => {
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

          clearRequests()

          await act(async () => {
            await browser
              .elementByCss('input[data-link-accordion="/isolated/third"]')
              .click()
            await browser
              .elementByCss('input[data-link-accordion="/isolated/fourth"]')
              .click()
          })

          const prefetchRequests = getRequests().filter((requestPath) =>
            requestPath.startsWith('/isolated/__fallback/index.txt')
          )

          expect(prefetchRequests).toHaveLength(1)
        } finally {
          await browser.close()
        }
      })

      it('falls through from a concrete route-tree probe to the hydrated fallback tree', async () => {
        let act!: ReturnType<typeof createRouterAct>
        const browser = await webdriver(port, '/hydrated/first/', {
          beforePageLoad(page: Playwright.Page) {
            act = createRouterAct(page)
          },
        })

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('first')
          })

          await act(async () => {}, 'no-requests')
          clearRequests()

          await act(async () => {
            await browser
              .elementByCss('input[data-link-accordion="/hydrated/second"]')
              .click()
          })

          const prefetchRequests = getRequests()

          expect(prefetchRequests.length).toBeGreaterThan(0)
          expect(
            prefetchRequests.some((requestPath) =>
              requestPath.startsWith('/hydrated/second/?_rsc=')
            )
          ).toBe(false)
          expect(
            prefetchRequests.some((requestPath) =>
              requestPath.startsWith('/hydrated/second/index.txt')
            )
          ).toBe(false)
          expect(
            prefetchRequests.some((requestPath) =>
              requestPath.startsWith('/hydrated/second/index.txt')
            )
          ).toBe(false)
          expect(
            prefetchRequests.some((requestPath) =>
              requestPath.startsWith('/hydrated/second/__fallback/index.txt')
            )
          ).toBe(true)
          expect(
            prefetchRequests.some((requestPath) =>
              requestPath.startsWith('/hydrated/second/__fallback.meta.json')
            )
          ).toBe(true)
          expect(
            prefetchRequests.some((requestPath) =>
              requestPath.startsWith('/hydrated/__fallback/__next._tree.txt')
            )
          ).toBe(true)
        } finally {
          await browser.close()
        }
      })

      it('reuses the same hydrated fallback tree endpoint across sibling prefetches', async () => {
        let act!: ReturnType<typeof createRouterAct>
        const browser = await webdriver(port, '/hydrated/first/', {
          beforePageLoad(page: Playwright.Page) {
            act = createRouterAct(page)
          },
        })

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('first')
          })

          clearRequests()

          await act(async () => {
            await browser
              .elementByCss('input[data-link-accordion="/hydrated/second"]')
              .click()
            await browser
              .elementByCss('input[data-link-accordion="/hydrated/third"]')
              .click()
          })

          const prefetchRequests = getRequests()
          const fallbackTreeRequests = prefetchRequests.filter((requestPath) =>
            requestPath.startsWith('/hydrated/__fallback/__next._tree.txt')
          )

          expect(
            prefetchRequests.some((requestPath) =>
              requestPath.startsWith('/hydrated/second/?_rsc=')
            )
          ).toBe(false)
          expect(
            prefetchRequests.some((requestPath) =>
              requestPath.startsWith('/hydrated/third/?_rsc=')
            )
          ).toBe(false)
          expect(
            prefetchRequests.some((requestPath) =>
              requestPath.startsWith('/hydrated/second/index.txt')
            )
          ).toBe(false)
          expect(
            prefetchRequests.some((requestPath) =>
              requestPath.startsWith('/hydrated/third/index.txt')
            )
          ).toBe(false)
          expect(fallbackTreeRequests).toHaveLength(2)
          expect(
            fallbackTreeRequests.every((requestPath) =>
              requestPath.startsWith('/hydrated/__fallback/__next._tree.txt')
            )
          ).toBe(true)
        } finally {
          await browser.close()
        }
      })

      it('loads nested fallback routes without concrete retries or extra probes', async () => {
        clearRequests()
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

          const requests = getRequests()

          expect(
            requests.some((requestPath) =>
              requestPath.startsWith('/org/umbrella/chat/thread-789/?_rsc=')
            )
          ).toBe(false)
          expect(
            requests.some((requestPath) =>
              requestPath.startsWith('/org/__fallback.meta.json')
            )
          ).toBe(false)
          expect(
            requests.some((requestPath) =>
              requestPath.startsWith('/org/__fallback.txt')
            )
          ).toBe(false)
          expect(
            requests.filter((requestPath) =>
              requestPath.startsWith('/org/__fallback/index.txt')
            )
          ).toHaveLength(1)
        } finally {
          await browser.close()
        }
      })
    }
  )
}
