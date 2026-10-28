import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'
import {
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('webpack-loader-file-dependencies', () => {
  const externalDependencyDirectory = mkdtempSync(
    join(realpathSync(tmpdir()), 'loader-build-dependency-')
  )
  const nativeDependency = join(externalDependencyDirectory, 'addon.node')
  const externalDependency = join(externalDependencyDirectory, 'dependency.js')
  writeFileSync(nativeDependency, 'native-one')
  writeFileSync(externalDependency, "module.exports = 'external-one'")

  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      // Do not let optional loader dependencies resolve from the repository's pnpm installation.
      NODE_PATH: '',
      DYNAMIC_BUILD_DEPENDENCY: './tracking/dynamic.js',
      NATIVE_BUILD_DEPENDENCY: nativeDependency,
      EXTERNAL_BUILD_DEPENDENCY: externalDependency,
      TURBO_ENGINE_IGNORE_DIRTY: '1',
      TURBO_ENGINE_SNAPSHOT_IDLE_TIMEOUT_MILLIS: '0',
      TURBO_ENGINE_SNAPSHOT_MIN_ACTIVE_TIME_MILLIS: '0',
      // Wait for turbo-tasks to persist the cache before the dev process exits.
      __NEXT_DEV_WAIT_FOR_TURBOPACK_SHUTDOWN: '1',
    },
    dependencies: {
      'build-dependency-esm-package': 'file:./build-dependency-esm-package',
      'build-dependency-package': 'file:./build-dependency-package',
      'directory-only-package': 'file:./directory-only-package',
      'tracking-package': 'file:./tracking-package',
      'test-resolution-loader': 'file:./resolution-loader',
      postcss: '8.5.28',
      'postcss-loader': '8.2.1',
      stylus: '0.64.0',
      'stylus-loader': '9.0.0',
    },
  })

  afterAll(() => {
    rmSync(externalDependencyDirectory, { recursive: true, force: true })
  })

  // The harness stops with SIGKILL by default, which can exit before the persistent cache is
  // written, so a restart would recompile instead of restoring cached results.
  const stop = () => next.stop('SIGTERM')

  it('preserves persistent caching for loaders without cached CommonJS children', async () => {
    const $ = await next.render$('/cache')
    const initial = $('p').text()
    expect(initial).toMatch(/^cacheable-\d+$/)
    await stop()
    await next.start()
    const $2 = await next.render$('/cache')
    if (await gate('turbopack')) {
      expect($2('p').text()).toBe(initial)
    } else {
      // This fixture only enables persistent caching for Turbopack.
      expect($2('p').text()).not.toBe(initial)
    }
  })

  it('should update when the dependency file changes', async () => {
    const $ = await next.render$('/')
    const initialText = await $('p').text()
    expect(initialText).toBeTruthy()

    await next.patchFile(
      'utils/file-dependency.ts',
      'export const magicValue = "magic-value-2";'
    )

    await retry(async () => {
      const $2 = await next.render$('/')
      const newText = $2('p').text()
      expect(newText).not.toBe(initialText)
    })
  })

  for (const [route, filename, initial, updated] of [
    ['/native', nativeDependency, 'native-one', 'native-two'],
    ['/external', externalDependency, 'external-one', 'external-two'],
  ]) {
    it(`does not reuse stale ${route} results across restarts`, async () => {
      const $ = await next.render$(route)
      expect($('p').text()).toBe(initial)
      if (await gate('turbopack')) {
        await retry(() => {
          const files = readdirSync(
            join(next.testDir, next.distDir, 'cache', 'turbopack'),
            { recursive: true }
          )
          expect(files.some((file) => String(file).endsWith('.sst'))).toBe(true)
        })
      }
      await stop()
      const contents =
        route === '/native' ? updated : `module.exports = '${updated}'`
      writeFileSync(filename, contents)
      try {
        await next.start()
        const $ = await next.render$(route)
        expect($('p').text()).toBe(updated)
      } finally {
        await stop()
        const contents =
          route === '/native' ? initial : `module.exports = '${initial}'`
        writeFileSync(filename, contents)
        await next.start()
      }
    })
  }

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

  // @force-gate turbopack
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

  it('should support build dependencies from postcss-loader', async () => {
    const $ = await next.render$('/')
    expect($('#postcss-output').text()).toContain('postcss-one')
  })

  // @force-gate turbopack
  it('updates when a postcss-loader build dependency changes', async () => {
    await next.render$('/')
    await next.patchFile(
      'utils/postcss-build-dependency.txt',
      'postcss-two',
      async () => {
        await retry(async () => {
          const $ = await next.render$('/')
          expect($('#postcss-output').text()).toContain('postcss-two')
        })
      }
    )
  })

  it('should support build dependencies from stylus-loader', async () => {
    const $ = await next.render$('/')
    expect($('#stylus-output').text()).toContain('stylus-value')
  })

  it('loads an edited stylus-loader plugin after restarting the dev server', async () => {
    const $ = await next.render$('/')
    expect($('#stylus-output').text()).toContain('stylus-value')
    // Stylus uses import(), whose Node module cache requires a fresh process.
    await stop()
    try {
      await next.patchFile(
        'stylus-build-dependency-plugin.js',
        (content) => content.replace('stylus-value', 'stylus-two'),
        async () => {
          await next.start()
          try {
            await retry(async () => {
              const $ = await next.render$('/')
              expect($('#stylus-output').text()).toContain('stylus-two')
            })
          } finally {
            await stop()
          }
        }
      )
    } finally {
      await next.start()
    }
    await retry(async () => {
      const $ = await next.render$('/')
      expect($('#stylus-output').text()).toContain('stylus-value')
    })
  })

  // @force-gate turbopack
  it('updates when a package entry added as a build dependency changes', async () => {
    const $ = await next.render$('/package')
    expect($('p').text()).toContain('package build dependency: package-one')

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

    await retry(async () => {
      const $2 = await next.render$('/package')
      expect($2('p').text()).toContain('package build dependency: package-one')
    }, 10000)
  })

  // @force-gate turbopack
  it('resolves .mjs build dependencies with ESM conditions', async () => {
    const $ = await next.render$('/mjs')
    expect($('p').text()).toContain('ESM build dependency: import-one')

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

  it('resolves a package directory build dependency', async () => {
    const $ = await next.render$('/package-directory')
    expect($('p').text()).toContain(
      'package directory build dependency: directory-one'
    )
  })

  // @force-gate turbopack
  it('updates a directory-only package build dependency', async () => {
    await next.render$('/package-directory')
    await next.patchFile(
      'node_modules/directory-only-package/data.txt',
      'directory-two',
      async () => {
        await retry(async () => {
          const $ = await next.render$('/package-directory')
          expect($('p').text()).toContain(
            'package directory build dependency: directory-two'
          )
        })
      }
    )
  })

  // Shared workers keep required CommonJS modules cached until the server restarts.
  it.each([
    [
      'an edited cached transitive loader dependency',
      'tracking-value.js',
      "module.exports = 'transitive-two'",
      'cached: transitive-one',
      'cached: transitive-two',
    ],
    [
      'a higher-priority CommonJS candidate',
      'tracking/candidate',
      "module.exports = 'extensionless-two'",
      'candidate: js-one',
      'candidate: extensionless-two',
    ],
    [
      'a nearer CommonJS package',
      'tracking/node_modules/tracking-package/value.js',
      "module.exports = 'nearer-two'",
      'package: package-one',
      'package: nearer-two',
    ],
    [
      'a changed CommonJS package export',
      'node_modules/tracking-package/package.json',
      JSON.stringify({
        name: 'tracking-package',
        version: '1.0.0',
        exports: { './value': './two.js' },
      }),
      'package: package-one',
      'package: package-two',
    ],
  ])(
    'loads %s after restarting the dev server',
    async (_name, fileName, content, initial, expected) => {
      const $ = await next.render$('/tracking')
      expect($('p').text()).toContain(initial)
      await stop()
      try {
        await next.patchFile(fileName, content, async () => {
          await next.start()
          try {
            const $ = await next.render$('/tracking')
            expect($('p').text()).toContain(expected)
          } finally {
            await stop()
          }
        })
      } finally {
        await next.start()
      }
    }
  )

  it('loads a nearer package when the previous dependency was symlinked', async () => {
    await stop()
    await next.renameFolder(
      'node_modules/tracking-package',
      'node_modules/tracking-package-backup'
    )
    try {
      await next.symlink('tracking-package', 'node_modules/tracking-package')
      await next.start()
      const $ = await next.render$('/tracking')
      expect($('p').text()).toContain('package: package-one')
      await stop()
      await next.patchFile(
        'tracking/node_modules/tracking-package/value.js',
        "module.exports = 'nearer-symlink-two'",
        async () => {
          await next.start()
          try {
            const $ = await next.render$('/tracking')
            expect($('p').text()).toContain('package: nearer-symlink-two')
          } finally {
            await stop()
          }
        }
      )
    } finally {
      await stop()
      await next.deleteFile('node_modules/tracking-package')
      await next.renameFolder(
        'node_modules/tracking-package-backup',
        'node_modules/tracking-package'
      )
      await next.start()
    }
  })

  // @force-gate turbopack
  it('updates when an uncached build dependency import changes', async () => {
    const $ = await next.render$('/tracking')
    expect($('p').text()).toContain('uncached: uncached-one')
    await next.patchFile(
      'tracking/uncached-value.js',
      "module.exports = 'uncached-two'",
      async () => {
        await retry(async () => {
          const $ = await next.render$('/tracking')
          expect($('p').text()).toContain('uncached: uncached-two')
        })
      }
    )
  })

  it('loads an edited dynamic CommonJS build dependency after restarting the dev server', async () => {
    const $ = await next.render$('/dynamic')
    expect($('p').text()).toContain('dynamic: dynamic-one')
    // CommonJS modules stay cached in the shared worker pool until the server restarts.
    await stop()
    try {
      await next.patchFile(
        'tracking/dynamic-value.js',
        "module.exports = 'dynamic-two'",
        async () => {
          await next.start()
          try {
            await retry(async () => {
              const $ = await next.render$('/dynamic')
              expect($('p').text()).toContain('dynamic: dynamic-two')
            })
          } finally {
            await stop()
          }
        }
      )
    } finally {
      await next.start()
    }
    await retry(async () => {
      const $ = await next.render$('/dynamic')
      expect($('p').text()).toContain('dynamic: dynamic-one')
    })
  })

  // @force-gate turbopack
  it('warns without failing for unresolved module and package-directory dependencies', async () => {
    const outputIndex = next.cliOutput.length
    const $ = await next.render$('/unresolved')
    expect($('p').text()).toContain('unresolved dependency warning')
    await retry(() => {
      const output = next.cliOutput.slice(outputIndex)
      expect(output).toContain(
        'Unable to resolve webpack loader build dependency'
      )
      expect(output).toContain('missing-build-dependency-package')
      expect(output).toContain('missing-build-dependency-module')
    })
  })
})
