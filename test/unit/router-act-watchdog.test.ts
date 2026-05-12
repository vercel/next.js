/* eslint-env jest */
/**
 * Regression test for the router-act watchdog. The watchdog exists so that
 * when an `act` scope hangs in CI we get a useful diagnostic in the test
 * output identifying the stuck phase and any in-flight RSC fetches, instead
 * of waiting for Jest's opaque 60s test timeout to fire.
 *
 * These tests don't go through Playwright — they pass a hand-rolled fake
 * page object so we can deterministically simulate hangs.
 */

describe('router-act watchdog', () => {
  function loadActWithEnv(env: Record<string, string | undefined>) {
    const prevEnv: Record<string, string | undefined> = {}
    for (const key of Object.keys(env)) {
      prevEnv[key] = process.env[key]
      const val = env[key]
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }
    jest.resetModules()
    const mod = require('../lib/router-act')
    for (const [key, val] of Object.entries(prevEnv)) {
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }
    return mod.createRouterAct as typeof import('../lib/router-act').createRouterAct
  }

  function makeMockPage() {
    const page: any = {
      route: async () => {},
      unroute: async () => {},
      on: () => {},
      off: () => {},
      evaluate: async () => {},
      once: () => {},
      request: { fetch: async () => ({}) },
    }
    return page
  }

  function captureStderr() {
    const captured: string[] = []
    const original = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((chunk: any) => {
      captured.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    }) as typeof process.stderr.write
    return {
      get text() {
        return captured.join('')
      },
      restore() {
        process.stderr.write = original
      },
    }
  }

  it('emits a diagnostic when the scope is stuck longer than the threshold', async () => {
    const createRouterAct = loadActWithEnv({
      ROUTER_ACT_WATCHDOG_MS: '200',
      ROUTER_ACT_WATCHDOG_INTERVAL_MS: '200',
    })

    const stderr = captureStderr()
    try {
      const act = createRouterAct(makeMockPage() as any)
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 700))
      }, 'no-requests')

      expect(stderr.text).toMatch(/\[router-act #\d+\] scope blocked for/)
      expect(stderr.text).toMatch(/phase: scope/)
      expect(stderr.text).toMatch(/in-flight RSC fetches: 0/)
      expect(stderr.text).toMatch(/call site:/)
    } finally {
      stderr.restore()
    }
  })

  it('does not emit a diagnostic when the scope completes before the threshold', async () => {
    const createRouterAct = loadActWithEnv({
      ROUTER_ACT_WATCHDOG_MS: '500',
      ROUTER_ACT_WATCHDOG_INTERVAL_MS: '500',
    })

    const stderr = captureStderr()
    try {
      const act = createRouterAct(makeMockPage() as any)
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 50))
      }, 'no-requests')

      expect(stderr.text).not.toMatch(/\[router-act/)
    } finally {
      stderr.restore()
    }
  })

  it('can be disabled with ROUTER_ACT_WATCHDOG_MS=0', async () => {
    const createRouterAct = loadActWithEnv({
      ROUTER_ACT_WATCHDOG_MS: '0',
    })

    const stderr = captureStderr()
    try {
      const act = createRouterAct(makeMockPage() as any)
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 400))
      }, 'no-requests')

      expect(stderr.text).not.toMatch(/\[router-act/)
    } finally {
      stderr.restore()
    }
  })

  it('is disabled by default (no env var set)', async () => {
    const createRouterAct = loadActWithEnv({
      ROUTER_ACT_WATCHDOG_MS: undefined,
      ROUTER_ACT_WATCHDOG_INTERVAL_MS: undefined,
    })

    const stderr = captureStderr()
    try {
      const act = createRouterAct(makeMockPage() as any)
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 400))
      }, 'no-requests')

      expect(stderr.text).not.toMatch(/\[router-act/)
    } finally {
      stderr.restore()
    }
  })
})
