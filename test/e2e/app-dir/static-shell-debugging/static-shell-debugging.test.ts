import { nextTestSetup } from 'e2e-utils'

describe('static-shell-debugging', () => {
  describe.each([
    { ppr: true, debugging: true },
    { ppr: false, debugging: true },
    { ppr: true, debugging: false },
    { ppr: false, debugging: false },
  ])('ppr = $ppr, debugging = $debugging', (context) => {
    const { next } = nextTestSetup({
      files: __dirname,
      env: {
        __NEXT_EXPERIMENTAL_STATIC_SHELL_DEBUGGING: context.debugging
          ? '1'
          : undefined,
      },
      nextConfig: { experimental: { ppr: context.ppr } },
    })

    if (context.debugging && context.ppr) {
      it('should only render the static shell', async () => {
        const res = await next.fetch('/?__nextppronly=1')
        expect(res.status).toBe(200)

        const html = await res.text()
        expect(html).toContain('Fallback')
        expect(html).not.toContain('Dynamic')
      })
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
})
