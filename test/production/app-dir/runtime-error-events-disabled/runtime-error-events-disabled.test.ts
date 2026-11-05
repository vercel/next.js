import { nextTestSetup } from 'e2e-utils'

// DEP0144: the TypeScript config loader reads module.parent in requireFromString,
// so --throw-deprecation prevents this fixture from building or starting.
// @force-gate !futureCompat
describe('runtime-error-events-disabled', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('does not open an HMR socket in production even when reporting is enabled', async () => {
    const sockets: string[] = []
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.on('websocket', (socket) => sockets.push(socket.url()))
      },
    })
    await browser.elementByCss('#throw').click()
    await browser.elementByCss('#increment').click()
    expect(await browser.elementByCss('#count').text()).toBe('1')
    expect(sockets.filter((url) => url.includes('/_next/hmr'))).toEqual([])
    expect((await next.fetch('/_next/hmr')).status).toBe(404)
  })
})
