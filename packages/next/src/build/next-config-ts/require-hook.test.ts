/**
 * @jest-environment node
 */
import Module from 'node:module'

// Minimal swc options — we don't actually transform anything in these tests,
// we just need a value to pass through.
const swcOptions = { jsc: { parser: { syntax: 'typescript' } } } as any

const ModuleAny = Module as any

describe('require-hook', () => {
  // `require.extensions` is initialized from `Module._extensions` when each
  // require function is created. Saving/restoring lets us simulate Node
  // 24.15+ Yarn PnP where the bridged require has no `.extensions`.
  let savedExtensions: unknown

  beforeEach(() => {
    savedExtensions = ModuleAny._extensions
    jest.resetModules()
  })

  afterEach(() => {
    ModuleAny._extensions = savedExtensions
    jest.resetModules()
  })

  describe('when require.extensions is undefined (Node 24.15+ via Yarn PnP)', () => {
    beforeEach(() => {
      ModuleAny._extensions = undefined
    })

    it('does not throw at module load', () => {
      expect(() => {
        jest.isolateModules(() => {
          (require('./require-hook') as typeof import('./require-hook'))
        })
      }).not.toThrow()
    })

    it('registerHook returns without throwing', () => {
      let registerHook!: (opts: typeof swcOptions) => void
      jest.isolateModules(() => {
        ;({ registerHook } = (require('./require-hook') as typeof import('./require-hook')))
      })
      expect(() => registerHook(swcOptions)).not.toThrow()
    })

    it('deregisterHook returns without throwing', () => {
      let deregisterHook!: () => void
      jest.isolateModules(() => {
        ;({ deregisterHook } = (require('./require-hook') as typeof import('./require-hook')))
      })
      expect(() => deregisterHook()).not.toThrow()
    })
  })

  describe('when require.extensions is defined (Node 20/22 and non-PnP setups)', () => {
    // Note: Jest gives each isolated require its own empty `extensions` object
    // distinct from Module._extensions, so we cannot verify which handlers got
    // registered from outside. We assert the only externally visible
    // invariants — that load + registerHook + deregisterHook each return
    // cleanly. The actual handler installation is exercised end-to-end by the
    // `next-config-ts` integration tests.
    it('registerHook returns without throwing', () => {
      let registerHook!: (opts: typeof swcOptions) => void
      jest.isolateModules(() => {
        ;({ registerHook } = (require('./require-hook') as typeof import('./require-hook')))
      })
      expect(() => registerHook(swcOptions)).not.toThrow()
    })

    it('deregisterHook returns without throwing after registerHook', () => {
      let registerHook!: (opts: typeof swcOptions) => void
      let deregisterHook!: () => void
      jest.isolateModules(() => {
        ;({ registerHook, deregisterHook } = (require('./require-hook') as typeof import('./require-hook')))
      })
      registerHook(swcOptions)
      expect(() => deregisterHook()).not.toThrow()
    })
  })
})
