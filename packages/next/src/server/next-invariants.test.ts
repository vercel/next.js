/**
 * @jest-environment node
 */

describe('__NEXT_INVARIANTS__', () => {
  function loadFreshModules() {
    let invariantsMod: typeof import('./next-invariants')
    jest.isolateModules(() => {
      // Install the real Proxy sentinel from node-environment-baseline
      delete (globalThis as any).__NEXT_INVARIANTS__
      // eslint-disable-next-line @next/internal/typechecked-require -- side-effect-only module, no exports to type
      require('./node-environment-baseline')
      invariantsMod =
        require('./next-invariants') as typeof import('./next-invariants')
    })
    return invariantsMod!
  }

  afterEach(() => {
    delete (globalThis as any).__NEXT_INVARIANTS__
  })

  describe('Proxy sentinel', () => {
    it('throws when reading a property before initialization', () => {
      loadFreshModules()

      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        ;(globalThis as any).__NEXT_INVARIANTS__.trailingSlash
      }).toThrow('trailingSlash was accessed before initialization')
    })

    it('throws when writing a property before initialization', () => {
      loadFreshModules()

      expect(() => {
        ;(globalThis as any).__NEXT_INVARIANTS__.trailingSlash = true
      }).toThrow('Cannot assign to __NEXT_INVARIANTS__.trailingSlash directly')
    })
  })

  describe('initializeNextInvariants', () => {
    it('replaces the sentinel with the real frozen object', () => {
      const { initializeNextInvariants } = loadFreshModules()

      initializeNextInvariants(
        {
          trailingSlash: true,
          experimental: { optimisticRouting: true },
        } as any,
        false
      )

      const invariants = (globalThis as any).__NEXT_INVARIANTS__
      expect(invariants.isDevServer).toBe(false)
      expect(invariants.trailingSlash).toBe(true)
      expect(invariants.experimentalOptimisticRouting).toBe(true)
    })

    it('freezes the resulting object', () => {
      const { initializeNextInvariants } = loadFreshModules()

      initializeNextInvariants(
        { trailingSlash: false, experimental: {} } as any,
        false
      )

      const invariants = (globalThis as any).__NEXT_INVARIANTS__
      expect(Object.isFrozen(invariants)).toBe(true)
    })

    it('is idempotent — first call wins, subsequent calls are no-ops', () => {
      const { initializeNextInvariants } = loadFreshModules()

      initializeNextInvariants(
        { trailingSlash: true, experimental: {} } as any,
        true
      )
      // Second call with different values should be a no-op
      initializeNextInvariants(
        { trailingSlash: false, experimental: {} } as any,
        false
      )

      const invariants = (globalThis as any).__NEXT_INVARIANTS__
      // First call's values should win
      expect(invariants.isDevServer).toBe(true)
      expect(invariants.trailingSlash).toBe(true)
    })
  })
})
