/* eslint-env jest */
// Regression tests for https://github.com/vercel/next.js/issues/73757
//
// `@next/mdx`'s string-form plugin syntax (e.g. `remarkPlugins: ['plugin']`)
// failed for ESM plugin packages in two ways:
//   1. Packages whose "exports" map only declares the "import" condition could
//      not be resolved by `require.resolve` (ERR_PACKAGE_PATH_NOT_EXPORTED), so
//      the build crashed.
//   2. Packages exposing the plugin as a *named* export (no default) resolved
//      to the module namespace object instead of the plugin function, so the
//      plugin was silently dropped.

import path from 'path'
import { execFileSync } from 'child_process'

const { interopDefault } = require('../../packages/next-mdx/mdx-js-loader')

describe('next-mdx interopDefault', () => {
  it('returns the default export when present', () => {
    const plugin = () => {}
    expect(interopDefault({ default: plugin })).toBe(plugin)
  })

  it('prefers the default export over named exports', () => {
    const defaultPlugin = () => {}
    const namedPlugin = () => {}
    expect(interopDefault({ default: defaultPlugin, namedPlugin })).toBe(
      defaultPlugin
    )
  })

  it('falls back to a function-valued named export when there is no default (issue #73757)', () => {
    const remarkPlugin = () => {}
    expect(interopDefault({ remarkPlugin })).toBe(remarkPlugin)
  })

  it('skips non-function named exports and returns the first function export', () => {
    const remarkPlugin = () => {}
    expect(interopDefault({ version: '1.0.0', meta: {}, remarkPlugin })).toBe(
      remarkPlugin
    )
  })

  it('returns the module itself when it is the plugin function (CJS interop)', () => {
    const plugin = () => {}
    expect(interopDefault(plugin)).toBe(plugin)
  })
})

describe('next-mdx importPluginForPath (import-only ESM packages, issue #73757)', () => {
  // Runs in a child Node process: jest's resolver shims require.resolve and
  // reports MODULE_NOT_FOUND, which would mask the real Node
  // ERR_PACKAGE_PATH_NOT_EXPORTED this fixture reproduces.
  const runner = path.join(
    __dirname,
    'fixtures',
    'mdx-esm-only-plugin',
    'resolve-check.js'
  )

  it('resolves an import-only ESM named-export plugin via the resolver, and fails without it', () => {
    const stdout = execFileSync('node', [runner], { encoding: 'utf8' })
    const line = stdout.split('\n').find((l) => l.startsWith('RESULT:'))
    expect(line).toBeTruthy()
    const result = JSON.parse(line!.slice('RESULT:'.length))

    // With the resolver fallback (the fix): the named export is returned.
    expect(result.withResolver).toBe('function')
    expect(result.withResolverName).toBe('esmOnlyPlugin')

    // Without it: Node throws the exact error reported in the issue.
    expect(result.withoutResolverCode).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED')
  })
})
