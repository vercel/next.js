import { mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import * as os from 'os'
import { join, resolve } from 'path'
import { recursiveDeleteSyncWithAsyncRetries } from './recursive-delete'
import {
  verifyDistDirIsInsideWorkspace,
  verifyDistDir,
  cleanDistDir,
  DistDirOutsideWorkspaceError,
  UnrecognizedDistDirError,
  DIST_DIR_MARKER,
} from './dist-dir'

jest.mock('./recursive-delete', () => {
  const actual = jest.requireActual('./recursive-delete')
  return {
    ...actual,
    recursiveDeleteSyncWithAsyncRetries: jest.fn(
      actual.recursiveDeleteSyncWithAsyncRetries
    ),
  }
})

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

  it('allows an in-app distDir when the inferred workspace root is unrelated', () => {
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

  it.each([DIST_DIR_MARKER, 'BUILD_ID', 'trace', 'trace-build'])(
    'allows a directory marked by %s',
    async (marker) => {
      await writeFile(join(distDir, marker), '')
      await writeFile(join(distDir, 'output.js'), '')

      expect(() => verifyDistDir(distDir)).not.toThrow()
    }
  )

  it.each(['cache', 'dev', 'diagnostics'])(
    'does not accept generic entry %s as a marker',
    async (name) => {
      await writeFile(join(distDir, name), '{}')
      await writeFile(join(distDir, 'source.js'), '')

      expect(() => verifyDistDir(distDir)).toThrow(UnrecognizedDistDirError)
    }
  )

  it('rejects invalid directory', async () => {
    await writeFile(join(distDir, 'build-manifest.json'), '{}')

    let message = 'Expected verifyDistDir to throw'
    try {
      verifyDistDir(distDir)
    } catch (error) {
      message = (error as Error).message.replace(distDir, '<distDir>')
    }

    expect(message).toMatchInlineSnapshot(`
     "The configured distDir does not appear to have been created by Next.js. Please confirm it is correct. A distDir should be empty, absent, or created by Next.js:

       distDir: <distDir>

     Read more: https://nextjs.org/docs/messages/invalid-dist-dir"
    `)
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

  it('retains the marker when cleanup fails partway', async () => {
    const cleanupError = new Error('cleanup failed')
    await writeFile(join(distDir, 'stale.js'), '')
    jest
      .mocked(recursiveDeleteSyncWithAsyncRetries)
      .mockImplementationOnce(async (_dir, retain) => {
        expect(await readdir(distDir)).toContain(DIST_DIR_MARKER)
        expect(retain?.has(DIST_DIR_MARKER)).toBe(true)
        await rm(join(distDir, 'stale.js'))
        throw cleanupError
      })

    await expect(cleanDistDir(distDir, [])).rejects.toBe(cleanupError)
    expect(await readdir(distDir)).toEqual([DIST_DIR_MARKER])
  })
})
