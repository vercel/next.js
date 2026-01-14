/* eslint-env jest */
import os from 'os'
import fs from 'fs-extra'
import { join } from 'path'
import { writeAppTypeDeclarations } from 'next/dist/lib/typescript/writeAppTypeDeclarations'
import { writeRouteTypesEntryFile } from 'next/dist/server/lib/router-utils/route-types-utils'

const fixtureDir = join(__dirname, 'fixtures/app-declarations')
const declarationFile = join(fixtureDir, 'next-env.d.ts')
const imageImportsEnabled = false

describe('writeAppTypeDeclarations', () => {
  beforeEach(async () => {
    await fs.ensureDir(fixtureDir)
  })
  afterEach(() => fs.remove(declarationFile))

  it('should preserve CRLF EOL', async () => {
    const eol = '\r\n'
    const content =
      '/// <reference types="next" />' +
      eol +
      (imageImportsEnabled
        ? '/// <reference types="next/image-types/global" />' + eol
        : '') +
      `import "./.next/types/routes.d.ts";` +
      eol +
      eol +
      '// NOTE: This file should not be edited' +
      eol +
      '// see https://nextjs.org/docs/pages/api-reference/config/typescript for more information.' +
      eol

    await fs.writeFile(declarationFile, content)

    await writeAppTypeDeclarations({
      baseDir: fixtureDir,
      distDir: '.next',
      imageImportsEnabled,
      hasPagesDir: false,
      hasAppDir: false,
    })
    expect(await fs.readFile(declarationFile, 'utf8')).toBe(content)
  })

  it('should preserve LF EOL', async () => {
    const eol = '\n'
    const content =
      '/// <reference types="next" />' +
      eol +
      (imageImportsEnabled
        ? '/// <reference types="next/image-types/global" />' + eol
        : '') +
      `import "./.next/types/routes.d.ts";` +
      eol +
      eol +
      '// NOTE: This file should not be edited' +
      eol +
      '// see https://nextjs.org/docs/pages/api-reference/config/typescript for more information.' +
      eol

    await fs.writeFile(declarationFile, content)

    await writeAppTypeDeclarations({
      baseDir: fixtureDir,
      distDir: '.next',
      imageImportsEnabled,
      hasPagesDir: false,
      hasAppDir: false,
    })
    expect(await fs.readFile(declarationFile, 'utf8')).toBe(content)
  })

  it('should use OS EOL by default', async () => {
    const eol = os.EOL
    const content =
      '/// <reference types="next" />' +
      eol +
      (imageImportsEnabled
        ? '/// <reference types="next/image-types/global" />' + eol
        : '') +
      `import "./.next/types/routes.d.ts";` +
      eol +
      eol +
      '// NOTE: This file should not be edited' +
      eol +
      '// see https://nextjs.org/docs/pages/api-reference/config/typescript for more information.' +
      eol

    await writeAppTypeDeclarations({
      baseDir: fixtureDir,
      distDir: '.next',
      imageImportsEnabled,
      hasPagesDir: false,
      hasAppDir: false,
    })
    expect(await fs.readFile(declarationFile, 'utf8')).toBe(content)
  })

  it('should include navigation types if app directory is enabled', async () => {
    await writeAppTypeDeclarations({
      baseDir: fixtureDir,
      distDir: '.next',
      imageImportsEnabled,
      hasPagesDir: false,
      hasAppDir: true,
    })

    await expect(fs.readFile(declarationFile, 'utf8')).resolves.not.toContain(
      'next/navigation-types/compat/navigation'
    )

    await writeAppTypeDeclarations({
      baseDir: fixtureDir,
      distDir: '.next',
      imageImportsEnabled,
      hasPagesDir: true,
      hasAppDir: true,
    })

    await expect(fs.readFile(declarationFile, 'utf8')).resolves.toContain(
      'next/navigation-types/compat/navigation'
    )
  })

  describe('next-env.d.ts consistency between dev and build', () => {
    it('should produce consistent content regardless of distDir', async () => {
      // Simulate dev mode: distDir = '.next/dev', distDirRoot = '.next'
      await writeAppTypeDeclarations({
        baseDir: fixtureDir,
        distDir: '.next/dev',
        distDirRoot: '.next',
        imageImportsEnabled,
        hasPagesDir: false,
        hasAppDir: true,
      })
      const devContent = await fs.readFile(declarationFile, 'utf8')

      // Simulate build mode: distDir = '.next', distDirRoot = '.next'
      await writeAppTypeDeclarations({
        baseDir: fixtureDir,
        distDir: '.next',
        distDirRoot: '.next',
        imageImportsEnabled,
        hasPagesDir: false,
        hasAppDir: true,
      })
      const buildContent = await fs.readFile(declarationFile, 'utf8')

      // Both should be identical
      expect(devContent).toBe(buildContent)
      // Should use fixed path from distDirRoot
      expect(devContent).toContain('import "./.next/types/routes.d.ts";')
      expect(devContent).not.toContain('.next/dev')
    })

    it('should use distDir when distDirRoot is not provided', async () => {
      await writeAppTypeDeclarations({
        baseDir: fixtureDir,
        distDir: '.next',
        imageImportsEnabled,
        hasPagesDir: false,
        hasAppDir: true,
      })
      const content = await fs.readFile(declarationFile, 'utf8')

      expect(content).toContain('import "./.next/types/routes.d.ts";')
    })
  })
})

describe('writeRouteTypesEntryFile', () => {
  const entryFileDir = join(fixtureDir, '.next', 'types')
  const entryFilePath = join(entryFileDir, 'routes.d.ts')

  beforeEach(async () => {
    await fs.ensureDir(entryFileDir)
  })
  afterEach(() => fs.remove(join(fixtureDir, '.next')))

  it('should write entry file with strictRouteTypes disabled', async () => {
    const actualTypesDir = join(fixtureDir, '.next', 'types')

    await writeRouteTypesEntryFile(entryFilePath, actualTypesDir, {
      strictRouteTypes: false,
      typedRoutes: false,
    })

    const content = await fs.readFile(entryFilePath, 'utf8')
    expect(content).toMatchInlineSnapshot(`
"// This is an auto-generated entry file that re-exports route types.
// Do not edit this file directly.

export type * from "./route-types.d.ts";
"
`)
  })

  it('should write entry file with strictRouteTypes enabled', async () => {
    const actualTypesDir = join(fixtureDir, '.next', 'types')

    await writeRouteTypesEntryFile(entryFilePath, actualTypesDir, {
      strictRouteTypes: true,
      typedRoutes: false,
    })

    const content = await fs.readFile(entryFilePath, 'utf8')
    expect(content).toMatchInlineSnapshot(`
"// This is an auto-generated entry file that re-exports route types.
// Do not edit this file directly.

export type * from "./route-types.d.ts";
import "./cache-life.d.ts";
import "./validator.ts";
"
`)
  })

  it('should write entry file with strictRouteTypes and typedRoutes enabled', async () => {
    const actualTypesDir = join(fixtureDir, '.next', 'types')

    await writeRouteTypesEntryFile(entryFilePath, actualTypesDir, {
      strictRouteTypes: true,
      typedRoutes: true,
    })

    const content = await fs.readFile(entryFilePath, 'utf8')
    expect(content).toMatchInlineSnapshot(`
"// This is an auto-generated entry file that re-exports route types.
// Do not edit this file directly.

export type * from "./route-types.d.ts";
import "./cache-life.d.ts";
import "./validator.ts";
import "./link.d.ts";
"
`)
  })

  it('should use relative path when entry file and actual types are in different directories', async () => {
    // Simulate dev mode: entry file at .next/types, actual types at .next/dev/types
    const devTypesDir = join(fixtureDir, '.next', 'dev', 'types')
    await fs.ensureDir(devTypesDir)

    await writeRouteTypesEntryFile(entryFilePath, devTypesDir, {
      strictRouteTypes: true,
      typedRoutes: true,
    })

    const content = await fs.readFile(entryFilePath, 'utf8')
    expect(content).toMatchInlineSnapshot(`
"// This is an auto-generated entry file that re-exports route types.
// Do not edit this file directly.

export type * from "./../dev/types/route-types.d.ts";
import "./../dev/types/cache-life.d.ts";
import "./../dev/types/validator.ts";
import "./../dev/types/link.d.ts";
"
`)
  })
})
