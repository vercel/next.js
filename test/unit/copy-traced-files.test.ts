/* eslint-env jest */

import { copyTracedFiles } from 'next/dist/build/utils'
import { join, relative, isAbsolute } from 'path'
import fs from 'fs-extra'

const testDir = join(__dirname, 'copy-traced-files-test')
const projectDir = join(testDir, 'project')
const outsideDir = join(testDir, 'outside')
const distDir = join(projectDir, '.next')
const standaloneDir = join(distDir, 'standalone')

// Mirrors a pnpm-on-Windows install: node_modules/<pkg> is a junction with an
// absolute target pointing into node_modules/.pnpm (see issue #95450).
const pnpmPkgDir = join(
  projectDir,
  'node_modules/.pnpm/my-pkg@1.0.0/node_modules/my-pkg'
)

describe('copyTracedFiles', () => {
  if (process.platform === 'win32') {
    it('should skip on windows to avoid symlink issues', () => {})
    return
  }
  afterAll(() => fs.remove(testDir))

  it('should remap absolute symlink targets inside the tracing root into the standalone output', async () => {
    await fs.remove(testDir)

    await fs.outputFile(join(pnpmPkgDir, 'index.js'), 'module.exports = 1')
    await fs.ensureSymlink(pnpmPkgDir, join(projectDir, 'node_modules/my-pkg'))

    // An absolute symlink target outside the tracing root must be preserved.
    await fs.outputFile(join(outsideDir, 'index.js'), 'module.exports = 2')
    await fs.ensureSymlink(
      outsideDir,
      join(projectDir, 'node_modules/outside-pkg')
    )

    await fs.outputJson(join(projectDir, 'package.json'), { name: 'app' })
    await fs.outputJson(join(distDir, 'next-server.js.nft.json'), {
      version: 1,
      files: [
        '../node_modules/my-pkg',
        '../node_modules/.pnpm/my-pkg@1.0.0/node_modules/my-pkg/index.js',
        '../node_modules/outside-pkg',
      ],
    })

    await copyTracedFiles(
      projectDir,
      distDir,
      [],
      undefined,
      projectDir,
      {} as any,
      {
        version: 3,
        middleware: {},
        functions: {},
        sortedMiddleware: [],
      } as any,
      false,
      false,
      new Set()
    )

    const copiedLink = join(standaloneDir, 'node_modules/my-pkg')
    const target = await fs.readlink(copiedLink)
    // The link must resolve inside the standalone output, not back into the
    // original project's node_modules.
    expect(isAbsolute(target)).toBe(true)
    expect(relative(standaloneDir, target).startsWith('..')).toBe(false)
    expect(target).toBe(
      join(standaloneDir, 'node_modules/.pnpm/my-pkg@1.0.0/node_modules/my-pkg')
    )
    // The remapped link resolves to the copied file.
    expect(await fs.readFile(join(copiedLink, 'index.js'), 'utf8')).toBe(
      'module.exports = 1'
    )

    // Targets outside the tracing root are left untouched.
    expect(
      await fs.readlink(join(standaloneDir, 'node_modules/outside-pkg'))
    ).toBe(outsideDir)
  })
})
