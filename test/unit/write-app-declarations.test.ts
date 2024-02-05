/* eslint-env jest */
import os from 'os'
import fs from 'fs/promises'
import { join } from 'path'
import { writeAppTypeDeclarations } from 'next/dist/lib/typescript/writeAppTypeDeclarations'

const fixtureDir = join(__dirname, 'fixtures/app-declarations')
const declarationDir = join(fixtureDir, '.next', 'types')
const declarationFile = join(declarationDir, 'next-env.d.ts')
const imageImportsEnabled = false

describe('find config', () => {
  beforeEach(async () => {
    await fs.mkdir(declarationDir, { recursive: true })
  })
  afterEach(() => fs.rm(declarationDir, { recursive: true }))

  it('should preserve CRLF EOL', async () => {
    const eol = '\r\n'
    const content =
      '/// <reference types="next" />' +
      eol +
      (imageImportsEnabled
        ? '/// <reference types="next/image-types/global" />' + eol
        : '')

    await fs.writeFile(declarationFile, content)

    await writeAppTypeDeclarations({
      baseDir: fixtureDir,
      imageImportsEnabled,
      hasPagesDir: false,
      isAppDirEnabled: false,
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
        : '')

    await fs.writeFile(declarationFile, content)

    await writeAppTypeDeclarations({
      baseDir: fixtureDir,
      imageImportsEnabled,
      hasPagesDir: false,
      isAppDirEnabled: false,
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
        : '')

    await writeAppTypeDeclarations({
      baseDir: fixtureDir,
      imageImportsEnabled,
      hasPagesDir: false,
      isAppDirEnabled: false,
    })
    expect(await fs.readFile(declarationFile, 'utf8')).toBe(content)
  })

  it('should include navigation types if app directory is enabled', async () => {
    await writeAppTypeDeclarations({
      baseDir: fixtureDir,
      imageImportsEnabled,
      hasPagesDir: false,
      isAppDirEnabled: true,
    })

    await expect(fs.readFile(declarationFile, 'utf8')).resolves.not.toContain(
      'next/navigation-types/compat/navigation'
    )

    await writeAppTypeDeclarations({
      baseDir: fixtureDir,
      imageImportsEnabled,
      hasPagesDir: true,
      isAppDirEnabled: true,
    })

    await expect(fs.readFile(declarationFile, 'utf8')).resolves.toContain(
      'next/navigation-types/compat/navigation'
    )
  })
})
