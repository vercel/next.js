import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page } from 'playwright'

describe('external-browser-runtime-streaming', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('reveals prerendered and dynamic boundaries with only the external runtime', async () => {
    const { externalBrowserRuntimeFile } = JSON.parse(
      await next.readFile('.next/build-manifest.json')
    )
    const runtimePath = `/_next/${externalBrowserRuntimeFile}`
    let releaseRuntime: () => void
    const runtimeReady = new Promise<void>((resolve) => {
      releaseRuntime = resolve
    })
    let releaseScripts: () => void
    const scriptsReady = new Promise<void>((resolve) => {
      releaseScripts = resolve
    })
    let page: Page

    await next.browser('/', {
      waitUntil: 'commit',
      waitHydration: false,
      async beforePageLoad(value) {
        page = value
        await page.route('**/*', async (route) => {
          const request = route.request()
          if (request.resourceType() === 'script') {
            if (new URL(request.url()).pathname === runtimePath) {
              await runtimeReady
            } else {
              await scriptsReady
            }
          }
          await route.continue()
        })
      },
    })

    await retry(async () => {
      expect(await page.locator('#shell').isVisible()).toBe(true)
      expect(await page.locator('#large-fallback').isVisible()).toBe(true)
      expect(await page.locator('#dynamic-fallback').isVisible()).toBe(true)
      expect(await page.locator('#large').isVisible()).toBe(false)
      expect(await page.locator('#dynamic').isVisible()).toBe(false)
      expect(await page.locator('#shell').getAttribute('data-hydrated')).toBe(
        'false'
      )
    })

    releaseRuntime()
    await retry(async () => {
      expect(await page.locator('#large').isVisible()).toBe(true)
      expect(await page.locator('#dynamic').isVisible()).toBe(true)
      expect(
        await page.locator('#large-fallback, #dynamic-fallback').count()
      ).toBe(0)
    })
    expect(await page.locator('#shell').getAttribute('data-hydrated')).toBe(
      'false'
    )
    expect(await page.locator('script:not([src])').count()).toBe(0)

    releaseScripts()
    await retry(async () => {
      expect(await page.locator('#shell').getAttribute('data-hydrated')).toBe(
        'true'
      )
      expect(await page.locator('#large').isVisible()).toBe(true)
      expect(await page.locator('#dynamic').isVisible()).toBe(true)
    })
  })
})
