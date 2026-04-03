import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-script-not-found', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('layout script should execute on normal page with parallel routes', async () => {
    const browser = await next.browser('/')
    const result = await browser.eval('window.__LAYOUT_SCRIPT_RAN')
    expect(result).toBe(true)
  })

  it('layout script should execute on 404 page with parallel routes', async () => {
    const browser = await next.browser('/nonexistent')
    const result = await browser.eval('window.__LAYOUT_SCRIPT_RAN')
    expect(result).toBe(true)
  })
})
