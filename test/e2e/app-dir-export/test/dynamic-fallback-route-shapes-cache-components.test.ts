import { createReadStream } from 'fs'
import http from 'http'
import { join } from 'path'
import { createNext, isNextDeploy, isNextDev, NextInstance } from 'e2e-utils'
import express from 'express'
import fs from 'fs-extra'
import { findPort, retry, stopApp } from 'next-test-utils'
import webdriver from 'next-webdriver'

if (isNextDeploy) {
  describe.skip('app dir - output export fallback route shapes with Cache Components', () => {})
} else {
  const describeProduction = isNextDev ? describe.skip : describe

  describeProduction(
    'app dir - output export fallback route shapes with Cache Components',
    () => {
      let next: NextInstance
      let port: number
      let stopOrKill: (() => Promise<void>) | undefined

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
        await next.build()

        port = await findPort()
        const app = express()
        const server = http.createServer(app)
        const outDir = join(next.testDir, 'out')
        const fallbackHtml = join(outDir, '_fallback.html')

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
        stopOrKill = () => stopApp(server)
      })

      afterAll(async () => {
        if (stopOrKill) {
          await stopOrKill()
        }
        await next.destroy()
      })

      it('emits fallback artifacts for catch-all, optional, grouped, parallel, and nested multi-segment route shapes', async () => {
        const outDir = join(next.testDir, 'out')

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

          await browser.eval('window.__routeShapeSentinel = 1')
          await browser
            .elementByCss('a[href="/docs/guides/export/fallback/"]')
            .click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'guides/export/fallback'
            )
            expect(await browser.eval('window.__routeShapeSentinel')).toBe(1)
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
    }
  )
}
