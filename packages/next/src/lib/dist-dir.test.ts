import { mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import * as os from 'os'
import { join, resolve } from 'path'
import {
  verifyDistDirIsInsideWorkspace,
  verifyDistDir,
  cleanDistDir,
  DistDirOutsideWorkspaceError,
  UnrecognizedDistDirError,
  DIST_DIR_MARKER,
} from './dist-dir'

describe('verifyDistDirIsInsideWorkspace', () => {
  // An app at <repo>/web/site, inside a monorepo rooted at <repo>.
  const appDir = '/repo/web/site'
  const workspaceRoot = '/repo'
  const verify = (distDir: string) =>
    verifyDistDirIsInsideWorkspace(
      resolve(appDir, distDir),
      appDir,
      workspaceRoot
    )

  it.each([
    '.next', // inside the app
    '.next/dev',
    '../.next', // beside the app, still in the workspace
    '../../.next', // at the workspace root, as Nx monorepos use
    '.', // the app itself; left to verifyDistDir, which sees its source
  ])('allows %s', (distDir) => {
    expect(() => verify(distDir)).not.toThrow()
  })

  it.each([
    '../..', // the workspace root itself
    '../../..', // above the workspace
    '/tmp/elsewhere',
  ])('rejects %s', (distDir) => {
    expect(() => verify(distDir)).toThrow(DistDirOutsideWorkspaceError)
  })

  it('rejects the app directory when it is its own workspace', () => {
    expect(() =>
      verifyDistDirIsInsideWorkspace('/proj', '/proj', '/proj')
    ).toThrow(DistDirOutsideWorkspaceError)
  })

  it('allows an in-app distDir when the workspace root is unrelated', () => {
    // `outputFileTracingRoot` may point outside the app entirely.
    expect(() =>
      verifyDistDirIsInsideWorkspace(`${appDir}/.next`, appDir, '/custom/root')
    ).not.toThrow()
  })
})

describe('verifyDistDir', () => {
  let distDir: string

  beforeEach(async () => {
    distDir = await mkdtemp(join(os.tmpdir(), 'next-distdir-'))
  })

  afterEach(async () => {
    await rm(distDir, { recursive: true, force: true })
  })

  it('allows a missing directory', () => {
    expect(() => verifyDistDir(join(distDir, 'nope'))).not.toThrow()
  })

  it('allows an empty directory', () => {
    expect(() => verifyDistDir(distDir)).not.toThrow()
  })

  it('allows a directory holding only a placeholder', async () => {
    // How an empty build directory gets committed to git.
    await writeFile(join(distDir, '.gitkeep'), '')

    expect(() => verifyDistDir(distDir)).not.toThrow()
  })

  it.each([DIST_DIR_MARKER, 'BUILD_ID', 'cache'])(
    'allows a directory marked by %s',
    async (marker) => {
      await writeFile(join(distDir, marker), '')
      await writeFile(join(distDir, 'output.js'), '')

      expect(() => verifyDistDir(distDir)).not.toThrow()
    }
  )

  it.each([
    ['package.json', 'every JS project has one'],
    ['lock', 'lockDistDir writes it before this check runs'],
  ])('does not accept %s as a marker (%s)', async (name) => {
    await writeFile(join(distDir, name), '{}')
    await writeFile(join(distDir, 'source.js'), '')

    expect(() => verifyDistDir(distDir)).toThrow(UnrecognizedDistDirError)
  })

  it('rejects an unmarked directory without naming its contents', async () => {
    // Entries may be Next.js output from an interrupted run, so listing them
    // as unexpected would be misleading.
    await writeFile(join(distDir, 'build-manifest.json'), '{}')

    expect(() => verifyDistDir(distDir)).toThrow(UnrecognizedDistDirError)
    expect(() => verifyDistDir(distDir)).not.toThrow(/build-manifest/)
  })
})

describe('cleanDistDir', () => {
  let distDir: string

  beforeEach(async () => {
    distDir = await mkdtemp(join(os.tmpdir(), 'next-distdir-'))
  })

  afterEach(async () => {
    await rm(distDir, { recursive: true, force: true })
  })

  it('deletes everything but the retained entries, and marks the directory', async () => {
    await mkdir(join(distDir, 'cache'))
    await writeFile(join(distDir, 'cache', 'entry'), '')
    await writeFile(join(distDir, 'stale.js'), '')

    await cleanDistDir(distDir, ['cache'])

    expect((await readdir(distDir)).sort()).toEqual([DIST_DIR_MARKER, 'cache'])
    expect(() => verifyDistDir(distDir)).not.toThrow()
  })

  it('creates and marks a missing directory', async () => {
    const missing = join(distDir, 'nested', 'out')

    await cleanDistDir(missing, [])

    expect(await readdir(missing)).toEqual([DIST_DIR_MARKER])
  })
})
