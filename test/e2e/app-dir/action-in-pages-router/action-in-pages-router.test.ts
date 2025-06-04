import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, retry } from 'next-test-utils'

describe('app-dir - action-in-pages-router', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should not error on fake server action in pages router', async () => {
    const browser = await next.browser('/foo')
    const button = await browser.elementByCss('button')
    await button.click()

    await retry(async () => {
      const browserLogText = (await browser.log())
        .map((item) => item.message)
        .join('')
      // This is a fake server action, a simple function so it can still work
      expect(browserLogText).toContain('action:foo')
      await assertNoRedbox(browser)
    })
  })

  if (isNextStart) {
    // Disabling for turbopack because the chunk path are different
    if (!process.env.IS_TURBOPACK_TEST) {
      it('should not contain server action in page bundle', async () => {
        const pageBundle = await next.readFile('.next/server/pages/foo.js')
        // Should not contain the RSC client import source for the server action
        expect(pageBundle).not.toContain('react-server-dom-webpack/client')
      })
    }

    it('should not contain server action in manifest', async () => {
      if (process.env.IS_TURBOPACK_TEST) {
        const manifest = JSON.parse(
          await next.readFile('.next/server/server-reference-manifest.json')
        )
        expect(Object.keys(manifest.node).length).toBe(0)
      } else {
        expect(
          await next.hasFile('.next/server/server-reference-manifest.json')
        ).toBe(false)
      }
    })
  }
})
