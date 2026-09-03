/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'

// Minimal swc options — we don't actually transform anything in these tests,
// we just need a value to pass through.
const swcOptions = { jsc: { parser: { syntax: 'typescript' } } }

describe('require-hook', () => {
  // The Node 24.15+ Yarn PnP regression cannot be reproduced inside
  // `jest.isolateModules`. Jest's `_createRequireImplementation`
  // unconditionally sets `moduleRequire.extensions = Object.create(null)`,
  // so the SUT always sees a truthy empty object regardless of how we
  // mutate `Module._extensions` in the outer process. We therefore exercise
  // the regression by spawning a Node subprocess that loads the SUT inside
  // a `vm` wrapper with a custom `require` whose `.extensions` is genuinely
  // undefined — exactly matching Yarn PnP's bridged require. (We can't
  // simply set `Module._extensions = undefined` globally either: that
  // breaks Node's own loader before the SUT can even be read in.)
  describe('when require.extensions is undefined (real Node 24.15+ Yarn PnP)', () => {
    // Resolve the built dist file so the subprocess can load it without
    // needing TypeScript on the path.
    const requireHookPath = path.resolve(
      __dirname,
      '../../../dist/build/next-config-ts/require-hook.js'
    )

    function runWithPnpLikeRequire(body: string) {
      const code = `
        const fs = require('node:fs')
        const path = require('node:path')
        const vm = require('node:vm')
        const Module = require('node:module')

        const targetPath = ${JSON.stringify(requireHookPath)}
        const targetCode = fs.readFileSync(targetPath, 'utf8')

        // Build a require where \`.extensions\` is genuinely undefined,
        // matching what Yarn PnP's bridged require looks like on Node 24.15+.
        // \`Module._extensions\` is left intact so Node's own loader
        // continues to work for transitive imports.
        const baseRequire = Module.createRequire(targetPath)
        function pnpLikeRequire(id) { return baseRequire(id) }
        pnpLikeRequire.cache = baseRequire.cache
        pnpLikeRequire.resolve = baseRequire.resolve.bind(baseRequire)
        pnpLikeRequire.main = baseRequire.main
        // Intentionally do NOT copy .extensions — that's the regression
        // trigger we want the SUT to face.
        if (typeof pnpLikeRequire.extensions !== 'undefined') {
          throw new Error(
            'Test setup precondition failed: expected pnpLikeRequire.extensions to be undefined'
          )
        }

        const moduleObj = { exports: {}, parent: null, paths: [] }
        const wrapper = vm.runInThisContext(
          '(function (exports, require, module, __filename, __dirname) { ' +
            targetCode +
            '\\n})',
          { filename: targetPath }
        )
        wrapper.call(
          moduleObj.exports,
          moduleObj.exports,
          pnpLikeRequire,
          moduleObj,
          targetPath,
          path.dirname(targetPath)
        )

        const sut = moduleObj.exports
        ${body}
        process.stdout.write('OK')
      `
      return spawnSync(process.execPath, ['-e', code], {
        encoding: 'utf8',
      })
    }

    it('module load does not throw', () => {
      const result = runWithPnpLikeRequire(``)
      expect(result.stderr).not.toContain('TypeError')
      expect(result.status).toBe(0)
      expect(result.stdout).toBe('OK')
    })

    it('registerHook returns without throwing and emits a one-time warning', () => {
      const result = runWithPnpLikeRequire(
        `sut.registerHook(${JSON.stringify(swcOptions)})`
      )
      expect(result.stderr).not.toContain('TypeError')
      expect(result.status).toBe(0)
      expect(result.stdout).toBe('OK')
      // The warnOnce makes the silent-skip diagnosable for users whose
      // next.config.ts contains `require('./helper.ts')`.
      expect(result.stderr).toContain(
        'require.extensions is unavailable on this Node.js version under Yarn PnP'
      )
    })

    it('deregisterHook returns without throwing', () => {
      const result = runWithPnpLikeRequire(`sut.deregisterHook()`)
      expect(result.stderr).not.toContain('TypeError')
      expect(result.status).toBe(0)
      expect(result.stdout).toBe('OK')
    })
  })

  // Sibling jest-process coverage of the happy path. Note: Jest gives each
  // isolated require its own empty `extensions` object distinct from
  // `Module._extensions`, so we cannot verify which handlers got registered
  // from outside. We assert the only externally visible invariants — that
  // load + registerHook + deregisterHook each return cleanly. The actual
  // handler installation is exercised end-to-end by the `next-config-ts`
  // integration tests.
  describe('when require.extensions is defined (Node 20/22 and non-PnP setups)', () => {
    beforeEach(() => {
      jest.resetModules()
    })

    afterEach(() => {
      jest.resetModules()
    })

    it('module load does not throw', () => {
      expect(() => {
        jest.isolateModules(() => {
          require('./require-hook') as typeof import('./require-hook')
        })
      }).not.toThrow()
    })

    it('registerHook returns without throwing', () => {
      let registerHook!: (opts: typeof swcOptions) => void
      jest.isolateModules(() => {
        ;({ registerHook } =
          require('./require-hook') as typeof import('./require-hook'))
      })
      expect(() => registerHook(swcOptions)).not.toThrow()
    })

    it('deregisterHook returns without throwing after registerHook', () => {
      let registerHook!: (opts: typeof swcOptions) => void
      let deregisterHook!: () => void
      jest.isolateModules(() => {
        ;({ registerHook, deregisterHook } =
          require('./require-hook') as typeof import('./require-hook'))
      })
      registerHook(swcOptions)
      expect(() => deregisterHook()).not.toThrow()
    })
  })
})
