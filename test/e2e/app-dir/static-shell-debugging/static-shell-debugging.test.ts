import { nextTestSetup } from 'e2e-utils'

describe('static-shell-debugging', () => {
  const ppr = Boolean(process.env.__NEXT_EXPERIMENTAL_PPR)
  const context = {
    ppr,
    debugging: ppr,
  }

  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    // This test skips deployment because env vars that are doubled underscore prefixed
    // are not supported. This is also intended to be used in development.
    skipDeployment: true,
    env: {
      __NEXT_EXPERIMENTAL_STATIC_SHELL_DEBUGGING: context.debugging
        ? '1'
        : undefined,
    },
    nextConfig: {
      experimental: { ppr: context.ppr },
    },
  })

  if (skipped) return

  if (context.debugging && context.ppr) {
    it('should only render the static shell', async () => {
      const res = await next.fetch('/?__nextppronly=1')
      expect(res.status).toBe(200)

      const html = await res.text()
      expect(html).toContain('Fallback')
      expect(html).not.toContain('Dynamic')
    })

    // The __nextppronly query param is currently only supported in dev mode.
    if (isNextDev) {
      it('should skip hydration to avoid blanking out the page', async () => {
        const browser = await next.browser('/?__nextppronly=1', {
          waitHydration: false,
        })

        expect(await browser.elementByCss('div').text()).toBe('Fallback')

        // Must not log the page error "Error: Connection closed."
        expect(await browser.log()).toEqual([])
      })
    }
  } else {
    it('should render the full page', async () => {
      const res = await next.fetch('/?__nextppronly=1')
      expect(res.status).toBe(200)

      const html = await res.text()
      expect(html).toContain('Fallback')
      expect(html).toContain('Dynamic')
    })
  }
})
