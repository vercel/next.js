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
    'dynamic-fallback-known-params-cache-components'
  ),
  skipDeployment: true,
  skipStart: true,
  disableAutoSkewProtection: true,
})

if (skipped) {
  describe.skip('app dir - output export dynamic routes with Cache Components and known prerenders', () => {})
} else {
  const describeProduction = isNextDev ? describe.skip : describe

  describeProduction(
    'app dir - output export dynamic routes with Cache Components and known prerenders',
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

      it('emits both prerendered known params and fallback artifacts', async () => {
        const outDir = join(next.testDir, 'out')

        expect(await fs.pathExists(join(outDir, '_fallback.html'))).toBe(true)
        expect(
          await fs.pathExists(
            join(outDir, 'another', '__fallback', 'index.txt')
          )
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'org', '__fallback', 'index.txt'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', 'first', 'index.html'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', 'second', 'index.html'))
        ).toBe(true)
        expect(
          await fs.pathExists(join(outDir, 'another', 'third', 'index.html'))
        ).toBe(false)
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

      it('serves both prerendered and fallback params', async () => {
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

      it('client navigates from a prerendered page to a fallback route', async () => {
        const browser = await webdriver(port, '/another/first/')

        try {
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('first')
          })

          await browser.elementByCss('a[href="/another/third/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('third')
          })

          await browser.elementByCss('a[href="/another/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('Another')
          })

          await browser.elementByCss('a[href="/another/first/"]').click()
          await retry(async () => {
            expect(await browser.elementByCss('h1').text()).toBe('first')
          })
        } finally {
          await browser.close()
        }
      })

      it('client navigates from a fallback route to a prerendered page', async () => {
        const browser = await webdriver(port, '/org/acme/chat/thread-789/')

        try {
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

      it('navigates from a known prerendered param to an unknown param via client nav then back', async () => {
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
