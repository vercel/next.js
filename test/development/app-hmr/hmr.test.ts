import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

const envFile = '.env.development.local'

describe(`app-dir-hmr`, () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('filesystem changes', () => {
    it('should not continously poll when hitting a not found page', async () => {
      let requestCount = 0

      const browser = await next.browser('/does-not-exist', {
        beforePageLoad(page) {
          page.on('request', (request) => {
            const url = new URL(request.url())
            if (url.pathname === '/does-not-exist') {
              requestCount++
            }
          })
        },
      })
      const body = await browser.elementByCss('body').text()
      expect(body).toContain('404')

      await waitFor(3000)

      expect(requestCount).toBe(1)
    })

    it('should not break when renaming a folder', async () => {
      const browser = await next.browser('/folder')
      const text = await browser.elementByCss('h1').text()
      expect(text).toBe('Hello')

      // Rename folder
      await next.renameFolder('app/folder', 'app/folder-renamed')

      try {
        // Should be 404 in a few seconds
        await retry(async () => {
          const body = await browser.elementByCss('body').text()
          expect(body).toContain('404')
        })

        // The new page should be rendered
        const newHTML = await next.render('/folder-renamed')
        expect(newHTML).toContain('Hello')
      } finally {
        // Rename it back
        await next.renameFolder('app/folder-renamed', 'app/folder')
      }
    })

    it('should update server components pages when env files is changed (nodejs)', async () => {
      const envContent = await next.readFile(envFile)
      const browser = await next.browser('/env/node')
      expect(await browser.elementByCss('p').text()).toBe('mac')
      await next.patchFile(envFile, 'MY_DEVICE="ipad"')

      const logs = await browser.log()
      await retry(async () => {
        expect(logs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: '[Fast Refresh] rebuilding',
              source: 'log',
            }),
          ])
        )
      })

      try {
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('ipad')
        })

        expect(logs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('[Fast Refresh] done in'),
              source: 'log',
            }),
          ])
        )
      } finally {
        await next.patchFile(envFile, envContent)
      }
    })

    it('should update server components pages when env files is changed (edge)', async () => {
      const envContent = await next.readFile(envFile)
      const browser = await next.browser('/env/edge')
      expect(await browser.elementByCss('p').text()).toBe('mac')
      await next.patchFile(envFile, 'MY_DEVICE="ipad"')

      const logs = await browser.log()
      await retry(async () => {
        expect(logs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: '[Fast Refresh] rebuilding',
              source: 'log',
            }),
          ])
        )
      })

      try {
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('ipad')
        })

        expect(logs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('[Fast Refresh] done in'),
              source: 'log',
            }),
          ])
        )
      } finally {
        await next.patchFile(envFile, envContent)
      }
    })

    it('should have no unexpected action error for hmr', async () => {
      expect(next.cliOutput).not.toContain('Unexpected action')
    })
  })
})
