/* eslint-env jest */

import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { copyTracedFiles } from 'next/dist/build/utils'

function isPathInside(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  )
}

async function copyTrace(projectDir: string, files: string[]) {
  const distDir = path.join(projectDir, '.next')

  await fs.outputJson(path.join(projectDir, 'package.json'), { name: 'app' })
  await fs.outputJson(path.join(distDir, 'next-server.js.nft.json'), {
    version: 1,
    files,
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

  return path.join(distDir, 'standalone')
}

describe('copyTracedFiles', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'next-copy-traced-files-'))
    )
  })

  afterEach(async () => {
    await fs.remove(testDir)
  })

  it('remaps absolute directory links into the standalone output', async () => {
    const projectDir = path.join(testDir, 'project')
    const packageTarget = path.join(
      projectDir,
      'node_modules/.pnpm/my-pkg@1.0.0/node_modules/my-pkg'
    )
    const packageLink = path.join(projectDir, 'node_modules/my-pkg')

    await fs.outputFile(
      path.join(packageTarget, 'index.js'),
      'module.exports = 1'
    )
    await fs.ensureDir(path.dirname(packageLink))
    await fs.symlink(
      packageTarget,
      packageLink,
      process.platform === 'win32' ? 'junction' : 'dir'
    )

    const standaloneDir = await copyTrace(projectDir, [
      '../node_modules/my-pkg',
      '../node_modules/.pnpm/my-pkg@1.0.0/node_modules/my-pkg/index.js',
    ])

    const copiedLink = path.join(standaloneDir, 'node_modules/my-pkg')
    const copiedTarget = await fs.readlink(copiedLink)
    const resolvedTarget = path.resolve(path.dirname(copiedLink), copiedTarget)

    expect(isPathInside(standaloneDir, resolvedTarget)).toBe(true)
    expect(await fs.readFile(path.join(copiedLink, 'index.js'), 'utf8')).toBe(
      'module.exports = 1'
    )

    // POSIX supports relative directory links without special privileges, so
    // the standalone output should remain valid after being relocated.
    if (process.platform !== 'win32') {
      expect(path.isAbsolute(copiedTarget)).toBe(false)

      const movedStandaloneDir = path.join(testDir, 'moved-standalone')
      await fs.move(standaloneDir, movedStandaloneDir)
      await fs.remove(projectDir)

      expect(
        await fs.readFile(
          path.join(movedStandaloneDir, 'node_modules/my-pkg/index.js'),
          'utf8'
        )
      ).toBe('module.exports = 1')
    }
  })

  it('uses dot for an absolute link to its own parent', async () => {
    const projectDir = path.join(testDir, 'project')
    const packageTarget = path.join(projectDir, 'node_modules/my-pkg')
    const packageLink = path.join(packageTarget, 'self')

    await fs.ensureDir(packageTarget)
    await fs.symlink(
      packageTarget,
      packageLink,
      process.platform === 'win32' ? 'junction' : 'dir'
    )

    const standaloneDir = await copyTrace(projectDir, [
      '../node_modules/my-pkg/self',
    ])
    const copiedPackageDir = path.join(standaloneDir, 'node_modules/my-pkg')
    const copiedLink = path.join(copiedPackageDir, 'self')

    expect(await fs.realpath(copiedLink)).toBe(
      await fs.realpath(copiedPackageDir)
    )
  })

  it('preserves absolute directory links outside the tracing root', async () => {
    const projectDir = path.join(testDir, 'project')
    const packageTarget = path.join(testDir, 'external-package')
    const packageLink = path.join(projectDir, 'node_modules/external-package')

    await fs.outputFile(
      path.join(packageTarget, 'index.js'),
      'module.exports = 1'
    )
    await fs.ensureDir(path.dirname(packageLink))
    await fs.symlink(
      packageTarget,
      packageLink,
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    const sourceTarget = await fs.readlink(packageLink)

    const standaloneDir = await copyTrace(projectDir, [
      '../node_modules/external-package',
    ])
    const copiedLink = path.join(standaloneDir, 'node_modules/external-package')
    const copiedTarget = await fs.readlink(copiedLink)
    const resolvedTarget = await fs.realpath(copiedLink)

    expect(path.isAbsolute(copiedTarget)).toBe(true)
    expect(path.resolve(copiedTarget)).toBe(path.resolve(sourceTarget))
    expect(resolvedTarget).toBe(await fs.realpath(packageTarget))
    expect(isPathInside(standaloneDir, resolvedTarget)).toBe(false)
  })

  if (process.platform !== 'win32') {
    it('preserves existing relative directory links', async () => {
      const projectDir = path.join(testDir, 'project')
      const packageTarget = path.join(
        projectDir,
        'node_modules/.pnpm/my-pkg@1.0.0/node_modules/my-pkg'
      )
      const packageLink = path.join(projectDir, 'node_modules/my-pkg')
      const relativeTarget = '.pnpm/my-pkg@1.0.0/node_modules/my-pkg'

      await fs.outputFile(
        path.join(packageTarget, 'index.js'),
        'module.exports = 1'
      )
      await fs.ensureDir(path.dirname(packageLink))
      await fs.symlink(relativeTarget, packageLink, 'dir')

      const standaloneDir = await copyTrace(projectDir, [
        '../node_modules/my-pkg',
        '../node_modules/.pnpm/my-pkg@1.0.0/node_modules/my-pkg/index.js',
      ])
      const copiedLink = path.join(standaloneDir, 'node_modules/my-pkg')

      expect(await fs.readlink(copiedLink)).toBe(relativeTarget)
      expect(await fs.readFile(path.join(copiedLink, 'index.js'), 'utf8')).toBe(
        'module.exports = 1'
      )
    })

    it('remaps absolute file links into the standalone output', async () => {
      const projectDir = path.join(testDir, 'project')
      const fileTarget = path.join(projectDir, 'files/target.js')
      const fileLink = path.join(projectDir, 'files/link.js')

      await fs.outputFile(fileTarget, 'module.exports = 1')
      await fs.symlink(fileTarget, fileLink, 'file')

      const standaloneDir = await copyTrace(projectDir, [
        '../files/link.js',
        '../files/target.js',
      ])
      const copiedLink = path.join(standaloneDir, 'files/link.js')
      const copiedTarget = await fs.readlink(copiedLink)

      expect(path.isAbsolute(copiedTarget)).toBe(false)
      expect(isPathInside(standaloneDir, await fs.realpath(copiedLink))).toBe(
        true
      )
      expect(await fs.readFile(copiedLink, 'utf8')).toBe('module.exports = 1')
    })
  }
})
