/* eslint-env jest */

import fs from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '../')

describe('Webpack - Bun Externals', () => {
  let buildResult

  beforeAll(async () => {
    buildResult = await nextBuild(appDir, [], {
      stdout: true,
      stderr: true,
    })
  })

  it('should successfully build with Bun module imports', () => {
    // The build should succeed even with Bun module imports
    expect(buildResult.code).toBe(0)
  })

  it('should externalize Bun builtins in server bundles', async () => {
    // Check the server bundle
    const serverBundle = await fs.readFile(
      join(appDir, '.next/server/pages/index.js'),
      'utf8'
    )

    // Bun modules should be treated as external
    // When modules are external, webpack preserves the require() calls
    const bunModules = [
      'bun:ffi',
      'bun:jsc',
      'bun:sqlite',
      'bun:test',
      'bun:wrap',
      'bun',
    ]

    bunModules.forEach((mod) => {
      // Check that the module name appears in require() calls
      // This indicates it was externalized, not bundled
      const escapedMod = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(serverBundle).toInclude(`require("${escapedMod}")`)
    })
  })

  it('should not bundle Bun module implementations', async () => {
    const serverBundle = await fs.readFile(
      join(appDir, '.next/server/pages/index.js'),
      'utf8'
    )

    // These patterns would indicate the modules were bundled, which we don't want
    expect(serverBundle).not.toContain('__webpack_require__.resolve("bun")')
  })
})
