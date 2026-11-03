import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe.each([
  { name: 'normal client', experimental: false, profiling: false },
  { name: 'normal profiling', experimental: false, profiling: true },
  { name: 'experimental client', experimental: true, profiling: false },
  { name: 'experimental profiling', experimental: true, profiling: true },
])('synchronous-flight-ping ($name)', ({ experimental, profiling }) => {
  const { next } = nextTestSetup({
    files: __dirname,
    buildArgs: profiling ? ['--profile'] : [],
    nextConfig: {
      experimental: { cpus: 2, taint: experimental },
    },
  })

  it('commits when a Flight chunk pings synchronously during a delayed render', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#synchronous').click()
    await check(
      () =>
        browser.eval(() =>
          window.flight.inspect().events.includes('ping:sync')
        ),
      true
    )
    const { events, version } = await browser.eval(() =>
      window.flight.inspect()
    )
    expect(version).toContain(experimental ? '-experimental-' : '-canary-')
    expect(events).toContain('render:pending')
    expect(events).toContain('delivered:resolved_model')
    expect(events).toContain('subscribe:resolved_model')
    expect(events).toContain('ping:sync')
    await check(() => browser.elementByCss('#content').text(), 'Updated')
    expect(await browser.elementByCss('#unrelated').text()).toBe(
      'Unrelated update: 0'
    )
  })

  it.each([false, true])(
    'commits an asynchronous Flight ping with unrelated update: %s',
    async (interrupt) => {
      const browser = await next.browser('/')
      await browser.elementByCss('#asynchronous').click()
      await check(
        () => browser.eval(() => window.flight.inspect().subscribed),
        true
      )
      expect(await browser.elementByCss('#content').text()).toBe('Initial')
      if (interrupt) {
        await browser.elementByCss('#unrelated').click()
        expect(await browser.elementByCss('#unrelated').text()).toBe(
          'Unrelated update: 1'
        )
      }
      await browser.eval(() => window.flight.release())
      await check(() => browser.elementByCss('#content').text(), 'Updated')
      const { events } = await browser.eval(() => window.flight.inspect())
      expect(events).toContain('subscribe:pending')
      expect(events).toContain('ping:async')
    }
  )
})
