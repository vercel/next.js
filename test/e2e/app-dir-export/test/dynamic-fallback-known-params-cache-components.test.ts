import { createReadStream } from 'fs'
import http from 'http'
import { join } from 'path'
import { createNext, isNextDeploy, isNextDev, NextInstance } from 'e2e-utils'
import express from 'express'
import fs from 'fs-extra'
import { findPort, retry, stopApp } from 'next-test-utils'
import webdriver from 'next-webdriver'

if (isNextDeploy) {
  describe.skip('app dir - output export fallback routes with known prerenders', () => {})
} else {
  const describeProduction = isNextDev ? describe.skip : describe

  describeProduction(
    'app dir - output export fallback routes with known prerenders',
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
            'dynamic-fallback-known-params-cache-components'
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

      it('emits both known prerenders and fallback artifacts', async () => {
        const outDir = join(next.testDir, 'out')

        expect(await fs.pathExists(join(outDir, '_fallback.html'))).toBe(true)
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
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', 'second', 'index.html'))
        ).toBe(true)
        expect(await fs.pathExists(join(outDir, 'another', 'third'))).toBe(
          false
        )
        expect(
          await fs.pathExists(join(outDir, 'org', '__fallback', 'index.txt'))
        ).toBe(true)
        expect(
          await fs.pathExists(
            join(outDir, 'org', 'acme', 'chat', 'thread-123', 'index.html')
          )
        ).toBe(true)
        expect(
          await fs.pathExists(
            join(outDir, 'org', 'acme', 'chat', 'thread-789', 'index.html')
          )
        ).toBe(false)
      })

      it('serves both prerendered and fallback params on hard load', async () => {
        const browser = await webdriver(port, '/another/first/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('first')
          })

          await browser.get(`http://localhost:${port}/another/third/`)
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })
        } finally {
          await browser.close()
        }
      })

      it('navigates from a known prerendered param to an unknown fallback param without reloading', async () => {
        const browser = await webdriver(port, '/another/first/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('first')
          })

          await browser.eval('window.__knownUnknownSentinel = 1')
          await browser.elementByCss('a[href="/another/third/"]').click()

          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
            expect(await browser.eval('window.location.pathname')).toBe(
              '/another/third/'
            )
            expect(await browser.eval('window.__knownUnknownSentinel')).toBe(1)
          })
        } finally {
          await browser.close()
        }
      })

      it('serves both prerendered and fallback params for nested dynamic routes', async () => {
        const browser = await webdriver(port, '/org/acme/chat/thread-123/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('#org-name').text()).toBe(
              'Org acme'
            )
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-123'
            )
          })

          await browser.get(
            `http://localhost:${port}/org/acme/chat/thread-789/`
          )
          await retry(async () => {
            expect(await browser.elementByCss('#org-name').text()).toBe(
              'Org acme'
            )
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-789'
            )
          })
        } finally {
          await browser.close()
        }
      })

      it('navigates between known and fallback nested params while preserving history', async () => {
        const browser = await webdriver(port, '/org/acme/chat/thread-123/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-123'
            )
          })

          await browser
            .elementByCss('a[href="/org/acme/chat/thread-789/"]')
            .click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-789'
            )
          })

          await browser.back()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-123'
            )
          })

          await browser
            .elementByCss('a[href="/org/acme/chat/thread-789/"]')
            .click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe(
              'acme:thread-789'
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
        } finally {
          await browser.close()
        }
      })

      it('preserves history across prerendered and fallback routes with search params', async () => {
        const browser = await webdriver(port, '/another/first/?mode=known')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('first')
            expect(await browser.eval('window.location.search')).toBe(
              '?mode=known'
            )
          })

          await browser.elementByCss('a[href="/another/third/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
            expect(await browser.eval('window.location.pathname')).toBe(
              '/another/third/'
            )
          })

          await browser.back()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('first')
            expect(await browser.eval('window.location.search')).toBe(
              '?mode=known'
            )
          })

          await browser.forward()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })
        } finally {
          await browser.close()
        }
      })
    }
  )
}
