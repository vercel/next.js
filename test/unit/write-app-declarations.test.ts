/* eslint-env jest */
import os from 'os'
import fs from 'fs-extra'
import { join } from 'path'
import { writeAppTypeDeclarations } from 'next/dist/lib/typescript/writeAppTypeDeclarations'

const fixtureDir = join(__dirname, 'fixtures/app-declarations')
const declarationFile = join(fixtureDir, 'next-env.d.ts')
const imageImportsEnabled = false

describe('find config', () => {
  afterEach(() => fs.remove(declarationFile))

  it('should preserve CRLF EOL', async () => {
    const eol = '\r\n'
    const content =
      '/// <reference types="next" />' +
      eol +
      (imageImportsEnabled
        ? '/// <reference types="next/image-types/global" />' + eol
        : '') +
      eol +
      '// NOTE: This file should not be edited' +
      eol +
      '// see https://nextjs.org/docs/basic-features/typescript for more information.' +
      eol

    await fs.ensureDir(fixtureDir)
    await fs.writeFile(declarationFile, content)

    await writeAppTypeDeclarations(fixtureDir, imageImportsEnabled)
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
      eol +
      '// NOTE: This file should not be edited' +
      eol +
      '// see https://nextjs.org/docs/basic-features/typescript for more information.' +
      eol

    await fs.ensureDir(fixtureDir)
    await fs.writeFile(declarationFile, content)

    await writeAppTypeDeclarations(fixtureDir, imageImportsEnabled)
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
      eol +
      '// NOTE: This file should not be edited' +
      eol +
      '// see https://nextjs.org/docs/basic-features/typescript for more information.' +
      eol

    await fs.ensureDir(fixtureDir)
    await writeAppTypeDeclarations(fixtureDir, imageImportsEnabled)
    expect(await fs.readFile(declarationFile, 'utf8')).toBe(content)
  })
})
