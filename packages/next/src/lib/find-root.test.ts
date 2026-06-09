import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findRootDirAndLockFiles } from './find-root'

describe('findRootDirAndLockFiles()', () => {
  it('ignores stray parent lockfiles without a package manifest', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nextjs-find-root-'))

    try {
      const appDir = join(rootDir, 'app')
      const parentLockfile = join(rootDir, 'package-lock.json')
      const appLockfile = join(appDir, 'package-lock.json')

      await mkdir(appDir)
      await writeFile(parentLockfile, '{}')
      await writeFile(join(appDir, 'package.json'), '{}')
      await writeFile(appLockfile, '{}')

      const result = findRootDirAndLockFiles(appDir)

      expect(result.rootDir).toBe(appDir)
      expect(result.lockFiles).toEqual([appLockfile])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('ignores parent package roots that do not declare workspaces', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nextjs-find-root-'))

    try {
      const appDir = join(rootDir, 'app')
      const parentLockfile = join(rootDir, 'bun.lock')
      const appLockfile = join(appDir, 'bun.lock')

      await mkdir(appDir)
      await writeFile(join(rootDir, 'package.json'), '{}')
      await writeFile(parentLockfile, '')
      await writeFile(join(appDir, 'package.json'), '{}')
      await writeFile(appLockfile, '')

      const result = findRootDirAndLockFiles(appDir)

      expect(result.rootDir).toBe(appDir)
      expect(result.lockFiles).toEqual([appLockfile])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('keeps higher package roots when they declare workspaces', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nextjs-find-root-'))

    try {
      const appDir = join(rootDir, 'apps', 'docs')
      const parentLockfile = join(rootDir, 'package-lock.json')
      const appLockfile = join(appDir, 'package-lock.json')

      await mkdir(appDir, { recursive: true })
      await writeFile(
        join(rootDir, 'package.json'),
        JSON.stringify({ workspaces: ['apps/*'] })
      )
      await writeFile(parentLockfile, '{}')
      await writeFile(join(appDir, 'package.json'), '{}')
      await writeFile(appLockfile, '{}')

      const result = findRootDirAndLockFiles(appDir)

      expect(result.rootDir).toBe(rootDir)
      expect(result.lockFiles).toEqual([appLockfile, parentLockfile])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('keeps higher pnpm workspace roots ahead of nested lockfiles', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nextjs-find-root-'))

    try {
      const appDir = join(rootDir, 'apps', 'docs')
      const workspaceFile = join(rootDir, 'pnpm-workspace.yaml')

      await mkdir(appDir, { recursive: true })
      await writeFile(workspaceFile, 'packages:\n  - apps/*\n')
      await writeFile(join(appDir, 'package.json'), '{}')
      await writeFile(join(appDir, 'pnpm-lock.yaml'), '')

      const result = findRootDirAndLockFiles(appDir)

      expect(result.rootDir).toBe(rootDir)
      expect(result.lockFiles).toEqual([workspaceFile])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
