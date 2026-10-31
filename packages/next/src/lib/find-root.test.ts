import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'fs/promises'
import * as os from 'os'
import { join } from 'path'
import * as Log from '../build/output/log'
import { findRootDirAndLockFiles, warnRootBoundary } from './find-root'

jest.mock('../build/output/log', () => ({
  warnOnce: jest.fn(),
}))
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: jest.fn(jest.requireActual('os').homedir),
}))

const PACKAGE_LOCK = JSON.stringify({
  lockfileVersion: 3,
  packages: { '': { name: 'test' } },
})

const temporaryDirectories: string[] = []
const actualHome = jest.requireActual<typeof os>('os').homedir()

async function temporaryDirectory() {
  const directory = await mkdtemp(join(os.tmpdir(), 'next-find-root-'))
  temporaryDirectories.push(directory)
  // the temporary directory itself may sit behind a symlink (macOS resolves
  // `/var` to `/private/var`), which the boundary checks resolve away.
  return realpath(directory)
}

async function writePackage(directory: string, packageJson = {}) {
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ name: 'test', ...packageJson })
  )
}

async function writePackageLock(directory: string) {
  await writePackage(directory)
  await writeFile(join(directory, 'package-lock.json'), PACKAGE_LOCK)
}

afterEach(async () => {
  jest.clearAllMocks()
  jest.mocked(os.homedir).mockReturnValue(actualHome)
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('findRootDirAndLockFiles', () => {
  it('continues to select the outermost valid lockfile', async () => {
    const directory = await temporaryDirectory()
    const workspace = join(directory, 'workspace')
    const app = join(workspace, 'apps', 'web')
    await writePackageLock(workspace)
    await writePackageLock(app)

    expect(findRootDirAndLockFiles(app)).toEqual({
      boundary: undefined,
      lockFiles: [
        join(app, 'package-lock.json'),
        join(workspace, 'package-lock.json'),
      ],
      rootDir: workspace,
    })
  })

  it('does not leave a Git worktree', async () => {
    const directory = await temporaryDirectory()
    const worktree = join(directory, 'worktree')
    const gitDirectory = join(directory, 'repo', '.git', 'worktrees', 'test')
    const app = join(worktree, 'app')
    await writePackageLock(directory)
    await writePackageLock(worktree)
    await mkdir(app, { recursive: true })
    await mkdir(gitDirectory, { recursive: true })
    await writeFile(join(gitDirectory, 'commondir'), '../..')
    await writeFile(join(worktree, '.git'), `gitdir: ${gitDirectory}`)

    expect(findRootDirAndLockFiles(app)).toEqual({
      boundary: undefined,
      lockFiles: [join(worktree, 'package-lock.json')],
      rootDir: worktree,
    })
  })

  it('escapes a Git submodule to the parent repository', async () => {
    const directory = await temporaryDirectory()
    const repository = join(directory, 'repository')
    const submodule = join(repository, 'submodule')
    const app = join(submodule, 'app')
    await writePackageLock(repository)
    await writePackageLock(submodule)
    await mkdir(join(repository, '.git', 'modules', 'submodule'), {
      recursive: true,
    })
    await mkdir(app, { recursive: true })
    await writeFile(
      join(submodule, '.git'),
      'gitdir: ../.git/modules/submodule'
    )

    expect(findRootDirAndLockFiles(app)).toEqual({
      boundary: undefined,
      lockFiles: [
        join(submodule, 'package-lock.json'),
        join(repository, 'package-lock.json'),
      ],
      rootDir: repository,
    })
  })

  it('rolls back at a Git repository boundary', async () => {
    const directory = await temporaryDirectory()
    const repository = join(directory, 'repository')
    const app = join(repository, 'app')
    await writePackageLock(directory)
    await writePackageLock(repository)
    await mkdir(join(repository, '.git'), { recursive: true })
    await mkdir(app, { recursive: true })

    expect(findRootDirAndLockFiles(app)).toEqual({
      boundary: {
        boundary: repository,
        marker: join(directory, 'package-lock.json'),
        root: directory,
        type: 'repository',
      },
      lockFiles: [join(repository, 'package-lock.json')],
      rootDir: repository,
    })
  })

  it('uses the app when the only lockfile is outside its Git repository', async () => {
    const directory = await temporaryDirectory()
    const repository = join(directory, 'repository')
    const app = join(repository, 'app')
    await writePackageLock(directory)
    await mkdir(join(repository, '.git'), { recursive: true })
    await mkdir(app, { recursive: true })

    expect(findRootDirAndLockFiles(app)).toEqual({
      boundary: {
        boundary: repository,
        marker: join(directory, 'package-lock.json'),
        root: directory,
        type: 'repository',
      },
      lockFiles: [],
      rootDir: app,
    })
  })

  it('does not infer the home directory as the root', async () => {
    const directory = await temporaryDirectory()
    const home = join(directory, 'home')
    const app = join(home, 'app')
    jest.mocked(os.homedir).mockReturnValue(home)
    await writePackageLock(home)
    await writePackageLock(app)

    expect(findRootDirAndLockFiles(app)).toEqual({
      boundary: {
        boundary: home,
        marker: join(home, 'package-lock.json'),
        root: home,
        type: 'home',
      },
      lockFiles: [join(app, 'package-lock.json')],
      rootDir: app,
    })
  })

  it('allows the home directory when the Next.js app is there', async () => {
    const directory = await temporaryDirectory()
    const home = join(directory, 'home')
    jest.mocked(os.homedir).mockReturnValue(home)
    await writePackageLock(directory)
    await writePackageLock(home)

    expect(findRootDirAndLockFiles(home)).toEqual({
      boundary: {
        boundary: home,
        marker: join(directory, 'package-lock.json'),
        root: directory,
        type: 'home',
      },
      lockFiles: [join(home, 'package-lock.json')],
      rootDir: home,
    })
  })

  it('resolves symlinks before the home-directory check', async () => {
    const directory = await temporaryDirectory()
    const realHome = join(directory, 'real-home')
    const linkHome = join(directory, 'link-home')
    const app = join(realHome, 'app')
    await writePackageLock(realHome)
    await writePackageLock(app)
    // `os.homedir()` reports a symlink to the real home directory. a lexical
    // comparison would decide `real-home` is not inside `link-home` and climb
    // straight past the home boundary.
    await symlink(realHome, linkHome)
    jest.mocked(os.homedir).mockReturnValue(linkHome)

    expect(findRootDirAndLockFiles(app)).toMatchObject({
      boundary: {
        boundary: realHome,
        root: realHome,
        type: 'home',
      },
      lockFiles: [join(app, 'package-lock.json')],
      rootDir: app,
    })
  })

  it('reports the root in the same form the caller used', async () => {
    const directory = await temporaryDirectory()
    const real = join(directory, 'real')
    const link = join(directory, 'link')
    const app = join(link, 'app')
    await writePackageLock(real)
    await writePackageLock(join(real, 'app'))
    await symlink(real, link)

    // callers derive paths relative to this root, so resolving symlinks away
    // here would leave the root pointing somewhere the caller never named.
    expect(findRootDirAndLockFiles(app)).toMatchObject({
      lockFiles: [
        join(app, 'package-lock.json'),
        join(link, 'package-lock.json'),
      ],
      rootDir: link,
    })
  })

  it.each([
    ['pnpm-workspace.yaml', 'packages:\n  - apps/*\n'],
    ['lerna.json', '{"packages":["apps/*"]}'],
  ])('recognizes %s as a workspace marker', async (name, contents) => {
    const directory = await temporaryDirectory()
    const workspace = join(directory, 'workspace')
    const app = join(workspace, 'apps', 'web')
    await mkdir(workspace, { recursive: true })
    await writeFile(join(workspace, name), contents)
    await writePackageLock(app)

    expect(findRootDirAndLockFiles(app)).toMatchObject({
      lockFiles: [],
      rootDir: workspace,
    })
  })

  it.each([
    ['an array', ['apps/*']],
    ['an object', { packages: ['apps/*'] }],
  ])(
    'recognizes package.json workspaces declared as %s',
    async (_name, workspaces) => {
      const directory = await temporaryDirectory()
      const workspace = join(directory, 'workspace')
      const app = join(workspace, 'apps', 'web')
      await writePackage(workspace, { workspaces })
      await writePackageLock(app)

      expect(findRootDirAndLockFiles(app)).toMatchObject({
        lockFiles: [],
        rootDir: workspace,
      })
    }
  )

  it('does not climb above a workspace marker to a stray lockfile', async () => {
    const directory = await temporaryDirectory()
    const workspace = join(directory, 'workspace')
    const app = join(workspace, 'apps', 'web')
    // a lockfile sits above the workspace root, but the workspace marker is
    // authoritative: the root must not escape past it.
    await writePackageLock(directory)
    await mkdir(workspace, { recursive: true })
    await writeFile(
      join(workspace, 'pnpm-workspace.yaml'),
      'packages:\n  - apps/*\n'
    )
    await writePackageLock(app)

    expect(findRootDirAndLockFiles(app)).toMatchObject({
      lockFiles: [],
      rootDir: workspace,
    })
  })

  it('keeps workspace precedence across multiple levels', async () => {
    const directory = await temporaryDirectory()
    const workspace = join(directory, 'workspace')
    const middle = join(workspace, 'packages')
    const nestedWorkspace = join(middle, 'nested')
    const app = join(nestedWorkspace, 'app')
    await mkdir(workspace, { recursive: true })
    await writeFile(join(workspace, 'pnpm-workspace.yaml'), 'packages: []')
    await writePackageLock(middle)
    await mkdir(nestedWorkspace, { recursive: true })
    await writeFile(join(nestedWorkspace, 'lerna.json'), '{"packages":[]}')
    await writePackageLock(app)

    expect(findRootDirAndLockFiles(app)).toMatchObject({
      lockFiles: [],
      rootDir: workspace,
    })
  })

  it.each(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock'])(
    'selects a %s as the root',
    async (name) => {
      const directory = await temporaryDirectory()
      const app = join(directory, 'app')
      await writePackage(app)
      await writeFile(join(app, name), '')

      expect(findRootDirAndLockFiles(app)).toMatchObject({
        lockFiles: [join(app, name)],
        rootDir: app,
      })
    }
  )
})

it('warns when a soft boundary changes the inferred root', () => {
  warnRootBoundary({
    boundary: '/repo',
    marker: '/parent/package-lock.json',
    root: '/parent',
    type: 'repository',
  })

  expect(Log.warnOnce).toHaveBeenCalledWith(
    expect.stringContaining('outside the current Git repository')
  )
})
