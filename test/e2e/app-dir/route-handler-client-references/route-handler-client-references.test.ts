import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('route-handler-client-references', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('references client components in a Flight payload rendered by a Route Handler', async () => {
    const res = await next.fetch('/rsc')
    expect(res.status).toBe(200)
    const payload = await res.text()

    // A client reference row for Counter, and no error row from failing to
    // find it in the Route Handler's client reference manifest.
    expect(payload).toMatch(/:I\[.*"Counter"\]/)
    expect(payload).not.toMatch(/:E\{/)
  })

  it('loads and hydrates the client component from that payload', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(await browser.elementByCss('#counter').text()).toBe('count: 0')
    })

    await browser.elementByCss('#counter').click()

    await retry(async () => {
      expect(await browser.elementByCss('#counter').text()).toBe('count: 1')
    })
  })
})
