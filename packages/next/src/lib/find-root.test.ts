import { mkdtemp, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { findRootDirAndLockFiles } from './find-root'

async function createTempDir() {
  return mkdtemp(join(tmpdir(), 'next-find-root-'))
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value))
}

describe('findRootDirAndLockFiles', () => {
  it('uses cwd when no lockfile is found', async () => {
    const rootDir = await createTempDir()
    const appDir = join(rootDir, 'app')
    await mkdir(appDir, { recursive: true })

    expect(findRootDirAndLockFiles(appDir)).toEqual({
      lockFiles: [],
      rootDir: appDir,
    })
  })

  it('uses the only detected lockfile as root', async () => {
    const rootDir = await createTempDir()
    const appDir = join(rootDir, 'app')
    await mkdir(appDir, { recursive: true })
    await writeJson(join(rootDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })

    expect(findRootDirAndLockFiles(appDir)).toEqual({
      lockFiles: [join(rootDir, 'package-lock.json')],
      rootDir,
    })
  })

  it('uses the closest lockfile when a parent lockfile is not a workspace root', async () => {
    const rootDir = await createTempDir()
    const appDir = join(rootDir, 'app')
    await mkdir(appDir, { recursive: true })
    await writeJson(join(rootDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })
    await writeJson(join(appDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })

    expect(findRootDirAndLockFiles(appDir)).toEqual({
      lockFiles: [
        join(appDir, 'package-lock.json'),
        join(rootDir, 'package-lock.json'),
      ],
      rootDir: appDir,
    })
  })

  it('uses a parent package.json workspaces root when it contains the app', async () => {
    const rootDir = await createTempDir()
    const appDir = join(rootDir, 'apps', 'web')
    await mkdir(appDir, { recursive: true })
    await writeJson(join(rootDir, 'package.json'), {
      private: true,
      workspaces: ['apps/*'],
    })
    await writeJson(join(rootDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })
    await writeJson(join(appDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })

    expect(findRootDirAndLockFiles(appDir)).toEqual({
      lockFiles: [
        join(appDir, 'package-lock.json'),
        join(rootDir, 'package-lock.json'),
      ],
      rootDir,
    })
  })

  it('uses a parent package.json workspaces root when it contains an ancestor package', async () => {
    const rootDir = await createTempDir()
    const appDir = join(rootDir, 'packages', 'site', 'apps', 'web')
    await mkdir(appDir, { recursive: true })
    await writeJson(join(rootDir, 'package.json'), {
      private: true,
      workspaces: ['packages/*'],
    })
    await writeJson(join(rootDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })
    await writeJson(join(appDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })

    expect(findRootDirAndLockFiles(appDir)).toEqual({
      lockFiles: [
        join(appDir, 'package-lock.json'),
        join(rootDir, 'package-lock.json'),
      ],
      rootDir,
    })
  })

  it('supports package.json workspaces.packages objects and exclusions', async () => {
    const rootDir = await createTempDir()
    const appDir = join(rootDir, 'apps', 'web')
    await mkdir(appDir, { recursive: true })
    await writeJson(join(rootDir, 'package.json'), {
      private: true,
      workspaces: {
        packages: ['apps/*', '!apps/docs'],
      },
    })
    await writeJson(join(rootDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })
    await writeJson(join(appDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })

    expect(findRootDirAndLockFiles(appDir)).toEqual({
      lockFiles: [
        join(appDir, 'package-lock.json'),
        join(rootDir, 'package-lock.json'),
      ],
      rootDir,
    })
  })

  it('normalizes package.json workspace patterns before matching', async () => {
    const rootDir = await createTempDir()
    const appDir = join(rootDir, 'apps', 'web')
    await mkdir(appDir, { recursive: true })
    await writeJson(join(rootDir, 'package.json'), {
      private: true,
      workspaces: ['./apps/*/'],
    })
    await writeJson(join(rootDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })
    await writeJson(join(appDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })

    expect(findRootDirAndLockFiles(appDir)).toEqual({
      lockFiles: [
        join(appDir, 'package-lock.json'),
        join(rootDir, 'package-lock.json'),
      ],
      rootDir,
    })
  })

  it('does not use a parent package.json workspaces root when the app is excluded', async () => {
    const rootDir = await createTempDir()
    const appDir = join(rootDir, 'apps', 'docs')
    await mkdir(appDir, { recursive: true })
    await writeJson(join(rootDir, 'package.json'), {
      private: true,
      workspaces: {
        packages: ['./apps/*/', '!./apps/docs/'],
      },
    })
    await writeJson(join(rootDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })
    await writeJson(join(appDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })

    expect(findRootDirAndLockFiles(appDir)).toEqual({
      lockFiles: [
        join(appDir, 'package-lock.json'),
        join(rootDir, 'package-lock.json'),
      ],
      rootDir: appDir,
    })
  })

  it('applies package.json workspace exclusions regardless of order', async () => {
    const rootDir = await createTempDir()
    const appDir = join(rootDir, 'apps', 'docs')
    await mkdir(appDir, { recursive: true })
    await writeJson(join(rootDir, 'package.json'), {
      private: true,
      workspaces: {
        packages: ['!apps/docs', 'apps/*'],
      },
    })
    await writeJson(join(rootDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })
    await writeJson(join(appDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })

    expect(findRootDirAndLockFiles(appDir)).toEqual({
      lockFiles: [
        join(appDir, 'package-lock.json'),
        join(rootDir, 'package-lock.json'),
      ],
      rootDir: appDir,
    })
  })

  it('prioritizes pnpm-workspace.yaml over lockfiles', async () => {
    const rootDir = await createTempDir()
    const appDir = join(rootDir, 'app')
    await mkdir(appDir, { recursive: true })
    await writeFile(
      join(rootDir, 'pnpm-workspace.yaml'),
      'packages:\n  - app\n'
    )
    await writeJson(join(appDir, 'package-lock.json'), {
      lockfileVersion: 3,
    })

    expect(findRootDirAndLockFiles(appDir)).toEqual({
      lockFiles: [join(rootDir, 'pnpm-workspace.yaml')],
      rootDir,
    })
  })
})
