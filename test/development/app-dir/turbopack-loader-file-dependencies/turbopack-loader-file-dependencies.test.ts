import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('turbopack-loader-file-dependencies', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'build-dependency-esm-package': 'file:./build-dependency-esm-package',
      'build-dependency-package': 'file:./build-dependency-package',
    },
  })

  it('should update when the dependency file changes', async () => {
    const $ = await next.render$('/')
    const initialText = await $('p').text()
    expect(initialText).toBeTruthy()

    await next.patchFile(
      'utils/file-dependency.ts',
      'export const magicValue = "magic-value-2";'
    )

    await waitFor(1000)

    const $2 = await next.render$('/')
    const newText = await $2('p').text()
    expect(newText).not.toBe(initialText)
  })

  it('should update when a missing dependency is created', async () => {
    const $ = await next.render$('/')
    const initialText = $('p').text()
    expect(initialText).toContain('missing dependency: false')

    await next.patchFile(
      'utils/missing-dependency.ts',
      'export const value = "created"',
      async () => {
        await retry(async () => {
          const $2 = await next.render$('/')
          expect($2('p').text()).toContain('missing dependency: true')
        })
      }
    )
  })

  it('should update when a build dependency changes', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toContain('build dependency: build-one')

    await next.patchFile(
      'utils/build-dependency.js',
      "module.exports = 'build-two'",
      async () => {
        await retry(async () => {
          const $2 = await next.render$('/')
          expect($2('p').text()).toContain('build dependency: build-two')
        }, 10000)
      }
    )
  })

  // @force-gate turbopack
  it('updates when a package entry added as a build dependency changes', async () => {
    const $ = await next.render$('/package')
    const initialText = $('p').text()
    expect(initialText).toContain('package build dependency: package-one')

    await next.patchFile(
      'node_modules/build-dependency-package/nested/value.js',
      "module.exports = 'unrelated-change'",
      async () => {
        await waitFor(1000)
        const $2 = await next.render$('/package')
        expect($2('p').text()).toBe(initialText)
      }
    )

    await next.patchFile(
      'node_modules/build-dependency-package/one.js',
      "module.exports = 'package-two'",
      async () => {
        await retry(async () => {
          const $2 = await next.render$('/package')
          expect($2('p').text()).toContain(
            'package build dependency: package-two'
          )
        }, 10000)
      }
    )
  })

  // @force-gate turbopack
  it('resolves .mjs build dependencies with ESM conditions', async () => {
    const $ = await next.render$('/mjs')
    const initialText = $('p').text()
    expect(initialText).toContain('ESM build dependency: import-one')

    await next.patchFile(
      'node_modules/build-dependency-esm-package/require.cjs',
      "module.exports = 'require-two'",
      async () => {
        await waitFor(1000)
        const $2 = await next.render$('/mjs')
        expect($2('p').text()).toContain('ESM build dependency: import-one')
      }
    )

    await next.patchFile(
      'node_modules/build-dependency-esm-package/import.mjs',
      "export default 'import-two'",
      async () => {
        await retry(async () => {
          const $2 = await next.render$('/mjs')
          expect($2('p').text()).toContain('ESM build dependency: import-two')
        }, 10000)
      }
    )

    await retry(async () => {
      const $2 = await next.render$('/mjs')
      expect($2('p').text()).toContain('ESM build dependency: import-one')
    }, 10000)
  })

  // @force-gate turbopack
  it('warns for unsupported build dependency inputs', async () => {
    await next.symlink('cyclic-build-dependency', 'cyclic-build-dependency')
    try {
      const outputIndex = next.cliOutput.length
      const $ = await next.render$('/unsupported')
      expect($('p').text()).toContain('unsupported build dependency')
      await retry(() => {
        const output = next.cliOutput.slice(outputIndex)
        expect(output).toContain('Unsupported webpack loader build dependency')
        expect(output).toContain('cyclic-build-dependency')
        expect(output).toContain('build-dependency.js')
        expect(output).not.toMatch(/EISDIR|ELOOP/)
      })
    } finally {
      await next.deleteFile('cyclic-build-dependency')
    }
  })

  // @force-gate turbopack
  it('updates when a nested file in a build dependency directory changes', async () => {
    const $ = await next.render$('/directory')
    expect($('p').text()).toContain('directory build dependency: nested-one')

    await next.patchFile(
      'build-dependency-package/nested/value.js',
      "module.exports = 'nested-two'",
      async () => {
        await retry(async () => {
          const $2 = await next.render$('/directory')
          expect($2('p').text()).toContain(
            'directory build dependency: nested-two'
          )
        }, 10000)
      }
    )
  })
})
