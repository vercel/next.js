// Imported through the same specifier tests use, so this also covers the
// re-export from next-test-utils.
import { gate } from 'next-test-utils'
import { __testing, _test_gate, expectTestToFail } from '../../lib/gate/runtime'
import {
  clearGateTestContext,
  setGateTestContext,
} from '../../lib/gate/test-context'
import { clearFixture, registerFixture } from '../../lib/gate/state'

// A false *static* `@gate` is decided at collection time (it registers
// through Jest's native `test.failing`), and collection runs before any
// `beforeEach` — so the pretend run context has to be pinned at module scope
// as well. The `beforeEach` below re-pins it for each test body.
setGateTestContext({
  mode: 'start',
  bundler: 'webpack',
  react18: false,
  wasm: false,
})

const parseGate = (source: string, force = false) =>
  __testing.parseGate({ force, source })

/** Builds the wrapped body the transform would have installed, and runs it. */
const runGated = (sources: string[], body: () => unknown) => {
  const wrapped = __testing.wrapGatedBody(
    sources.map((s) => parseGate(s)),
    body
  )
  return (wrapped as () => Promise<void>)()
}

type FakeTestFn = jest.Mock & {
  skip: jest.Mock
  only: jest.Mock & { failing: jest.Mock }
  failing: jest.Mock
}

const makeFakeTestFn = (): FakeTestFn =>
  Object.assign(jest.fn(), {
    skip: jest.fn(),
    only: Object.assign(jest.fn(), { failing: jest.fn() }),
    failing: jest.fn(),
  }) as FakeTestFn

/**
 * Swaps `global.it` / `global.test` / `global.describe` for spies while `fn`
 * runs, so `_test_gate`'s registration decisions can be observed without
 * actually registering tests.
 */
const withFakeTestGlobals = (fn: () => void) => {
  const fakes = {
    it: makeFakeTestFn(),
    test: makeFakeTestFn(),
    describe: makeFakeTestFn(),
  }
  const originals = {
    it: global.it,
    test: global.test,
    describe: global.describe,
  }
  Object.assign(global, fakes)
  try {
    fn()
  } finally {
    Object.assign(global, originals)
  }
  return fakes
}

const fixtureWith = (config: Record<string, unknown>) => {
  const getResolvedConfig = jest.fn(async () => config)
  registerFixture({ getResolvedConfig })
  return getResolvedConfig
}

describe('@gate runtime', () => {
  let warn: jest.SpyInstance

  beforeEach(() => {
    setGateTestContext({
      mode: 'start',
      bundler: 'webpack',
      react18: false,
      wasm: false,
    })
    warn = jest.spyOn(require('console'), 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    clearFixture()
    clearGateTestContext()
  })

  describe('a gate that holds', () => {
    it('runs the body and lets it pass', async () => {
      const body = jest.fn()
      await runGated(['!dev'], body)
      expect(body).toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    })

    it('lets a failure through', async () => {
      await expect(
        runGated(['!dev'], () => {
          throw new Error('boom')
        })
      ).rejects.toThrow('boom')
    })
  })

  describe('a gate that is false', () => {
    it('absorbs a failing body and reports it', async () => {
      await runGated(['dev'], () => {
        throw new Error('boom')
      })
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('gated test failed as expected (@gate dev)')
      )
    })

    it('absorbs a rejected promise', async () => {
      await runGated(['dev'], async () => {
        throw new Error('boom')
      })
      expect(warn).toHaveBeenCalled()
    })

    it('FAILS when the body passes, naming the stale pragma', async () => {
      await expect(runGated(['dev'], () => {})).rejects.toThrow(
        /Gated test passed unexpectedly[\s\S]*The gate is stale: delete the `\/\/ @gate dev` pragma/
      )
    })

    it('reports the first false gate when several are applied', async () => {
      await expect(runGated(['!start', 'dev'], () => {})).rejects.toThrow(
        '`// @gate !start` pragma'
      )
    })
  })

  describe('lazy conditions', () => {
    it('reads the running fixture’s resolved config', async () => {
      const getResolvedConfig = fixtureWith({ cacheComponents: true })
      // cacheComponents is on, so `!cacheComponents` is false: a passing body
      // is a stale gate.
      await expect(runGated(['!cacheComponents'], () => {})).rejects.toThrow(
        'Gated test passed unexpectedly'
      )
      expect(getResolvedConfig).toHaveBeenCalled()
    })

    it('holds when the config says so', async () => {
      fixtureWith({ cacheComponents: false })
      const body = jest.fn()
      await runGated(['!cacheComponents'], body)
      expect(body).toHaveBeenCalled()
    })

    it('reads keys that stayed under `experimental`', async () => {
      fixtureWith({ cacheComponents: true, experimental: { ppr: true } })
      const body = jest.fn()
      await runGated(['ppr && cacheComponents'], body)
      expect(body).toHaveBeenCalled()
    })

    it('is not resolved at all for a static-only gate', async () => {
      const getResolvedConfig = fixtureWith({ cacheComponents: true })
      await runGated(['!dev'], () => {})
      expect(getResolvedConfig).not.toHaveBeenCalled()
    })

    it('explains itself when no fixture is registered', async () => {
      clearFixture()
      await expect(runGated(['cacheComponents'], () => {})).rejects.toThrow(
        'no fixture is registered'
      )
    })
  })

  describe('the runtime gate() import', () => {
    it('answers a predicate over the conditions, without inverting anything', async () => {
      expect(await gate((c) => !c.dev)).toBe(true)
      expect(await gate((c) => c.dev)).toBe(false)
      expect(await gate((c) => c.mode === 'start' && c.webpack)).toBe(true)
    })

    it('reads a lazy condition from the running fixture', async () => {
      const getResolvedConfig = fixtureWith({ cacheComponents: true })
      expect(await gate((c) => c.cacheComponents)).toBe(true)
      expect(await gate((c) => !c.cacheComponents)).toBe(false)
      expect(getResolvedConfig).toHaveBeenCalled()
    })

    it('rejects an undeclared condition like the pragma does', async () => {
      await expect(gate((c) => c.cacheComponnents)).rejects.toThrow(
        'references an undeclared condition "cacheComponnents"'
      )
    })

    it('supports static predicates in suites with no fixture', async () => {
      clearFixture()
      expect(await gate((c) => c.start)).toBe(true)
      await expect(gate((c) => c.cacheComponents)).rejects.toThrow(
        'no fixture is registered'
      )
    })

    it('also accepts the pragma expression language as a string', async () => {
      fixtureWith({ cacheComponents: true })
      expect(await gate("mode === 'start' && webpack")).toBe(true)
      expect(await gate('!cacheComponents')).toBe(false)
      await expect(gate('cacheComponnents')).rejects.toThrow(
        'references an undeclared condition "cacheComponnents"'
      )
    })

    it('does not resolve the config for a static-only string expression', async () => {
      const getResolvedConfig = fixtureWith({ cacheComponents: true })
      await gate('!dev')
      expect(getResolvedConfig).not.toHaveBeenCalled()
    })
  })

  describe('collection-time validation', () => {
    it('rejects an undeclared condition and lists the declared ones', () => {
      expect(() => parseGate('cacheComponnents')).toThrow(
        'references an undeclared condition "cacheComponnents"'
      )
      expect(() => parseGate('cacheComponnents')).toThrow(
        /Declared conditions: .*cacheComponents/
      )
    })

    it('rejects an unparsable expression, quoting the pragma', () => {
      expect(() => parseGate('dev &&')).toThrow(
        'Could not parse `// @gate dev &&`'
      )
    })

    it('rejects a `done`-callback test', () => {
      expect(() =>
        __testing.wrapGatedBody([parseGate('dev')], (done: unknown) => done)
      ).toThrow('cannot use the `done` callback')
    })
  })

  describe('@force-gate', () => {
    it('accepts a lazy condition, classified for runtime resolution', () => {
      const gate = parseGate('!cacheComponents', true)
      expect(gate.force).toBe(true)
      expect(gate.needsResolvedConfig).toBe(true)
    })

    it('accepts a static condition, decided at collection', () => {
      const gate = parseGate('!dev', true)
      expect(gate.force).toBe(true)
      expect(gate.needsResolvedConfig).toBe(false)
    })

    it('skips the test for real when the condition is false', () => {
      const body = () => {}
      const fakes = withFakeTestGlobals(() => {
        _test_gate([{ force: true, source: 'dev' }], 'it')('a test', body)
      })
      expect(fakes.it.skip).toHaveBeenCalledWith('a test', body, undefined)
      expect(fakes.it).not.toHaveBeenCalled()
    })

    it('registers the test normally when the condition holds', () => {
      const fakes = withFakeTestGlobals(() => {
        _test_gate([{ force: true, source: '!dev' }], 'it')('a test', () => {})
      })
      expect(fakes.it).toHaveBeenCalledTimes(1)
      expect(fakes.it.skip).not.toHaveBeenCalled()
    })

    it('skips a whole describe with describe.skip', () => {
      const fakes = withFakeTestGlobals(() => {
        _test_gate([{ force: true, source: 'dev' }], 'describe')(
          'a suite',
          () => {}
        )
      })
      expect(fakes.describe.skip).toHaveBeenCalledWith(
        'a suite',
        expect.any(Function),
        undefined
      )
      expect(fakes.describe).not.toHaveBeenCalled()
    })

    it('leaves a `@gate` on the same test in charge when it holds', async () => {
      const fakes = withFakeTestGlobals(() => {
        _test_gate(
          [
            { force: true, source: '!dev' },
            { force: false, source: 'dev' },
          ],
          'it'
        )('a test', () => {})
      })
      expect(fakes.it.skip).not.toHaveBeenCalled()
      // The non-force gate is static and false, so the test registers through
      // Jest's native `test.failing`. Jest inverts the outcome itself; the
      // wrapper only logs. A passing body warns that the gate is stale (Jest
      // then fails the test on its own).
      expect(fakes.it).not.toHaveBeenCalled()
      expect(fakes.it.failing).toHaveBeenCalledTimes(1)
      const registered = fakes.it.failing.mock
        .calls[0][1] as () => Promise<void>
      await registered()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Gated test passed unexpectedly')
      )
    })

    it('logs when a `test.failing` body fails as expected', async () => {
      const fakes = withFakeTestGlobals(() => {
        _test_gate([{ force: false, source: 'dev' }], 'it')('a test', () => {
          throw new Error('boom')
        })
      })
      const registered = fakes.it.failing.mock
        .calls[0][1] as () => Promise<void>
      await expect(registered()).rejects.toThrow('boom')
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('gated test failed as expected (@gate dev)')
      )
    })

    it('keeps the decision at runtime when a lazy force-gate could override it', () => {
      const fakes = withFakeTestGlobals(() => {
        _test_gate(
          [
            { force: true, source: '!cacheComponents' },
            { force: false, source: 'dev' },
          ],
          'it'
        )('a test', () => {})
      })
      // `dev` is false, but the lazy `@force-gate !cacheComponents` might
      // force-pass the test instead, and that can't be known until the
      // fixture's config resolves — so no collection-time `test.failing`.
      expect(fakes.it.failing).not.toHaveBeenCalled()
      expect(fakes.it).toHaveBeenCalledTimes(1)
    })

    it('force-passes a lazy force-gate whose condition is false', async () => {
      fixtureWith({ cacheComponents: true }) // `!cacheComponents` is false
      const body = jest.fn()
      const wrapped = __testing.wrapGatedBody(
        [parseGate('!cacheComponents', true)],
        body
      )
      await (wrapped as () => Promise<void>)()
      expect(body).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('skipped by `@force-gate !cacheComponents`')
      )
    })

    it('runs the body when a lazy force-gate condition holds', async () => {
      fixtureWith({ cacheComponents: false }) // `!cacheComponents` is true
      const body = jest.fn()
      const wrapped = __testing.wrapGatedBody(
        [parseGate('!cacheComponents', true)],
        body
      )
      await (wrapped as () => Promise<void>)()
      expect(body).toHaveBeenCalled()
    })
  })

  describe('a static condition outside the e2e harness', () => {
    it('explains why it is unavailable', async () => {
      clearGateTestContext()
      await expect(runGated(['dev'], () => {})).rejects.toThrow(
        'no run context has been recorded'
      )
    })
  })

  // The tests above drive the runtime's internals directly. These two go
  // through the real pragma path — the transform rewrote them, and the `it` /
  // `describe` globals installed by `installGate()` registered them. This file
  // pretends the run mode is `start`, so `dev` is false and a failing body is
  // absorbed. The stale-gate direction cannot be asserted from inside Jest (the
  // whole point is that it fails the test); see test/lib/gate/README.md.
  // @gate dev
  it('absorbs a failure through the real pragma path', () => {
    expect(1).toBe(2)
  })

  // @gate dev
  describe('a gate on a describe', () => {
    it('is inherited by a test that has no pragma of its own', () => {
      expect(1).toBe(2)
    })
  })

  describe('expectTestToFail', () => {
    it('throws the provided error when the callback succeeds', async () => {
      const error = new Error('should have failed')
      await expect(expectTestToFail(() => {}, error)).rejects.toBe(error)
    })

    it('resolves when the callback throws', async () => {
      await expect(
        expectTestToFail(() => {
          throw new Error('boom')
        }, new Error('unused'))
      ).resolves.toBeUndefined()
    })
  })
})
