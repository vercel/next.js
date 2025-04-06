import { nextTestSetup } from 'e2e-utils'

describe('<Link /> onNavigate prop', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const routers = [
    { name: 'App Router', path: '/app-router' },
    { name: 'Pages Router', path: '/pages-router' },
  ]

  routers.forEach(({ name, path }) => {
    describe(name, () => {
      it('should trigger onClick but not onNavigate when using modifier key', async () => {
        const browser = await next.browser(path)

        // Check initial state
        expect(await browser.elementById('is-clicked').text()).toBe(
          'isClicked: false'
        )
        expect(await browser.elementById('is-navigated').text()).toBe(
          'isNavigated: false'
        )

        // Click with modifier key based on OS to open in new window
        const platform = process.platform
        const modifierKey = platform === 'darwin' ? 'Meta' : 'Control'

        // First press down the modifier key
        await browser.keydown(modifierKey)

        // Click the link while the modifier key is pressed
        await browser.elementById('link-to-subpage').click()

        // Release the modifier key
        await browser.keyup(modifierKey)

        await browser.waitForIdleNetwork()

        // Should trigger onClick but not onNavigate
        expect(await browser.elementById('is-clicked').text()).toBe(
          'isClicked: true'
        )
        expect(await browser.elementById('is-navigated').text()).toBe(
          'isNavigated: false'
        )
      })

      it('should trigger both onClick and onNavigate for internal navigation', async () => {
        const browser = await next.browser(path)

        // Check initial state
        expect(await browser.elementById('is-clicked').text()).toBe(
          'isClicked: false'
        )
        expect(await browser.elementById('is-navigated').text()).toBe(
          'isNavigated: false'
        )

        // Click internal link
        await browser.elementById('link-to-subpage').click()
        await browser.waitForIdleNetwork()

        // Should trigger both onClick and onNavigate
        expect(await browser.elementById('is-clicked').text()).toBe(
          'isClicked: true'
        )
        expect(await browser.elementById('is-navigated').text()).toBe(
          'isNavigated: true'
        )
      })

      it('should prevent navigation when onNavigate calls preventDefault', async () => {
        const browser = await next.browser(path)

        // Check initial state
        expect(await browser.elementById('is-locked').text()).toBe(
          'isLocked: false'
        )

        // Lock navigation
        await browser.elementById('toggle-lock').click()
        expect(await browser.elementById('is-locked').text()).toBe(
          'isLocked: true'
        )

        // Try to navigate
        await browser.elementById('link-to-subpage').click()
        await browser.waitForIdleNetwork()

        // Should trigger onClick but not navigate or trigger onNavigate
        expect(await browser.elementById('is-clicked').text()).toBe(
          'isClicked: true'
        )
        expect(await browser.elementById('is-navigated').text()).toBe(
          'isNavigated: false'
        )

        // Verify we're still on the same page
        expect(await browser.url()).toContain(path)
      })

      it('should only trigger onClick for external links with target="_blank"', async () => {
        const browser = await next.browser(path)

        // Check initial state
        expect(await browser.elementById('is-clicked').text()).toBe(
          'isClicked: false'
        )
        expect(await browser.elementById('is-navigated').text()).toBe(
          'isNavigated: false'
        )

        // We can't fully test the new window, but we can verify the events are triggered
        await browser.elementById('external-link-with-target').click()
        await browser.waitForIdleNetwork()

        // Should only trigger onClick for external links with target
        expect(await browser.elementById('is-clicked').text()).toBe(
          'isClicked: true'
        )
        expect(await browser.elementById('is-navigated').text()).toBe(
          'isNavigated: false'
        )
      })

      it('should only trigger onClick for download links', async () => {
        const browser = await next.browser(path)

        // Check initial state
        expect(await browser.elementById('is-clicked').text()).toBe(
          'isClicked: false'
        )
        expect(await browser.elementById('is-navigated').text()).toBe(
          'isNavigated: false'
        )

        // Click download link
        await browser.elementById('download-link').click()
        await browser.waitForIdleNetwork()

        // Should trigger both onClick and onNavigate for download links
        expect(await browser.elementById('is-clicked').text()).toBe(
          'isClicked: true'
        )
        expect(await browser.elementById('is-navigated').text()).toBe(
          'isNavigated: false'
        )
      })

      it('should only trigger both onClick for external links', async () => {
        const alerts: string[] = []
        const browser = await next.browser(path, {
          beforePageLoad(page) {
            page.on('dialog', (dialog) => {
              alerts.push(dialog.message())
              dialog.dismiss()
            })
          },
        })

        await browser.elementById('external-link').click()
        await browser.waitForIdleNetwork()

        expect(alerts).toEqual(['onClick'])
      })

      it('should replace history state for external links with replace prop', async () => {
        const browser = await next.browser(path)

        // Get initial history length
        const initialLength = await browser.eval('history.length')

        // Click external link with replace
        await browser.elementById('external-link-with-replace').click()
        await browser.waitForIdleNetwork()

        // Verify history length hasn't changed (replace instead of push)
        const finalLength = await browser.eval('history.length')
        expect(finalLength).toBe(initialLength)
      })
    })
  })
})
