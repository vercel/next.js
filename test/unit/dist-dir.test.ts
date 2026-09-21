/* eslint-env jest */
import fs from 'fs-extra'
import os from 'os'
import { join, resolve } from 'path'
import {
  verifyDistDirIsInsideWorkspace,
  verifyDistDirOwnership,
  cleanDistDir,
  UnrecognizedDistDirError,
  DistDirOutsideWorkspaceError,
  DIST_DIR_MARKER,
} from 'next/dist/lib/dist-dir'

describe('verifyDistDirIsInsideWorkspace', () => {
  // A Next.js app at <repo>/web/site. The "application directory" is the one
  // holding next.config.js; the "workspace root" is the monorepo root.
  const appDir = '/repo/web/site'
  const workspaceRoot = '/repo'
  const verify = (distDir: string) =>
    verifyDistDirIsInsideWorkspace(
      resolve(appDir, distDir),
      appDir,
      workspaceRoot
    )

  it.each([
    ['../../..', 'above the workspace'],
    ['../..', 'the workspace root itself'],
    ['/tmp/elsewhere', 'an unrelated absolute path'],
  ])('rejects %s (%s)', (distDir) => {
    expect(() => verify(distDir)).toThrow(DistDirOutsideWorkspaceError)
  })

  it('names both boundaries in the error', () => {
    expect(() => verify('../..')).toThrow(/application:\s+\/repo\/web\/site/)
    expect(() => verify('../..')).toThrow(/workspace root:\s+\/repo/)
  })

  it('leaves the application directory itself to the ownership check', () => {
    // In a workspace the app dir is strictly inside the root, so containment
    // cannot reject it. `verifyDistDirOwnership` catches it instead, because
    // an app directory holds source files and no Next.js marker.
    expect(() => verify('.')).not.toThrow()
  })

  it('rejects the application directory when it is its own workspace', () => {
    const standalone = '/proj'
    expect(() =>
      verifyDistDirIsInsideWorkspace(standalone, standalone, standalone)
    ).toThrow(DistDirOutsideWorkspaceError)
  })

  it.each([
    ['.next', 'inside the application'],
    ['build', 'inside the application'],
    ['.next/dev', 'the dev subdirectory'],
    ['../.next', 'a sibling of the application, inside the workspace'],
    ['../../.next', 'at the workspace root, as Nx monorepos use'],
  ])('allows %s (%s)', (distDir) => {
    expect(() => verify(distDir)).not.toThrow()
  })

  it('allows an in-app distDir when the workspace root is unrelated', () => {
    // `outputFileTracingRoot` can point somewhere that is not an ancestor of
    // the app, and that must not invalidate an otherwise fine distDir.
    expect(() =>
      verifyDistDirIsInsideWorkspace(
        resolve(appDir, '.next'),
        appDir,
        '/custom/root'
      )
    ).not.toThrow()
  })
})

describe('verifyDistDirOwnership', () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(join(os.tmpdir(), 'next-distdir-'))
  })

  afterEach(async () => {
    await fs.remove(projectDir)
  })

  describe('ownership', () => {
    let distDir: string

    beforeEach(async () => {
      distDir = join(projectDir, '.next')
      await fs.mkdirp(distDir)
    })

    it('allows a directory that does not exist', () => {
      expect(() =>
        verifyDistDirOwnership(join(projectDir, 'nope'))
      ).not.toThrow()
    })

    it('allows an empty directory', () => {
      expect(() => verifyDistDirOwnership(distDir)).not.toThrow()
    })

    it('allows a directory containing the marker alongside other files', async () => {
      await fs.writeFile(join(distDir, DIST_DIR_MARKER), '')
      await fs.writeFile(join(distDir, 'some-output.js'), '')

      expect(() => verifyDistDirOwnership(distDir)).not.toThrow()
    })

    it.each(['BUILD_ID', 'trace', 'trace-build'])(
      'allows a pre-marker directory identified by %s',
      async (legacyMarker) => {
        await fs.writeFile(join(distDir, legacyMarker), '')
        await fs.writeFile(join(distDir, 'some-output.js'), '')

        expect(() => verifyDistDirOwnership(distDir)).not.toThrow()
      }
    )

    it.each(['cache', 'dev', 'diagnostics'])(
      'allows a pre-marker directory identified by the %s directory',
      async (legacyMarker) => {
        await fs.mkdirp(join(distDir, legacyMarker))
        await fs.writeFile(join(distDir, 'some-output.js'), '')

        expect(() => verifyDistDirOwnership(distDir)).not.toThrow()
      }
    )

    it('does not treat package.json as evidence of ownership', async () => {
      // Next.js writes one into distDir, but so does every JS project.
      // Accepting it would let `distDir: '.'` delete an app's own source.
      await fs.writeFile(join(distDir, 'package.json'), '{"name":"app"}')
      await fs.writeFile(join(distDir, 'index.js'), 'source')

      expect(() => verifyDistDirOwnership(distDir)).toThrow(
        UnrecognizedDistDirError
      )
    })

    it('does not treat the lock file as evidence of ownership', async () => {
      // `experimental.lockDistDir` writes `lock` into distDir on startup, so
      // treating it as a marker would make every directory look like ours.
      await fs.writeFile(join(distDir, 'lock'), '')
      await fs.writeFile(join(distDir, 'important.txt'), 'user data')

      expect(() => verifyDistDirOwnership(distDir)).toThrow(
        UnrecognizedDistDirError
      )
    })

    it('allows a directory containing only incidental files', async () => {
      await fs.writeFile(join(distDir, '.DS_Store'), '')
      await fs.writeFile(join(distDir, '.gitignore'), '')

      expect(() => verifyDistDirOwnership(distDir)).not.toThrow()
    })

    it('rejects an in-project directory holding unrelated files', async () => {
      await fs.writeFile(join(distDir, 'important.txt'), 'user data')
      await fs.mkdirp(join(distDir, 'nested'))

      expect(() => verifyDistDirOwnership(distDir)).toThrow(
        UnrecognizedDistDirError
      )
    })

    it('names the missing marker file in the error', async () => {
      await fs.writeFile(join(distDir, 'important.txt'), 'user data')

      expect(() => verifyDistDirOwnership(distDir)).toThrow(
        new RegExp(DIST_DIR_MARKER)
      )
    })

    it('does not list the directory contents in the error', async () => {
      // Entries here may well be Next.js output from an interrupted run, so
      // listing them as unexpected would be misleading.
      await fs.writeFile(join(distDir, 'build-manifest.json'), '{}')
      await fs.mkdirp(join(distDir, 'server'))

      expect(() => verifyDistDirOwnership(distDir)).toThrow(
        UnrecognizedDistDirError
      )
      expect(() => verifyDistDirOwnership(distDir)).not.toThrow(
        /build-manifest\.json/
      )
    })

    it('accepts a directory after cleanDistDir marks it', async () => {
      await fs.writeFile(join(distDir, 'leftover-output.js'), '')

      expect(() => verifyDistDirOwnership(distDir)).toThrow(
        UnrecognizedDistDirError
      )

      await cleanDistDir(distDir, [])

      expect(() => verifyDistDirOwnership(distDir)).not.toThrow()
    })

    it('writes an explanatory marker file', async () => {
      await cleanDistDir(distDir, [])

      const contents = await fs.readFile(join(distDir, DIST_DIR_MARKER), 'utf8')
      expect(contents).toContain('managed by Next.js')
    })
  })
})

describe('cleanDistDir', () => {
  let projectDir: string
  let distDir: string

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(join(os.tmpdir(), 'next-distdir-'))
    distDir = join(projectDir, '.next')
    await fs.mkdirp(distDir)
  })

  afterEach(async () => {
    await fs.remove(projectDir)
  })

  it('deletes the contents', async () => {
    await fs.writeFile(join(distDir, 'stale.js'), '')
    await fs.mkdirp(join(distDir, 'server'))

    await cleanDistDir(distDir, [])

    expect(await fs.pathExists(join(distDir, 'stale.js'))).toBe(false)
    expect(await fs.pathExists(join(distDir, 'server'))).toBe(false)
  })

  it('keeps the retained entries', async () => {
    await fs.mkdirp(join(distDir, 'cache'))
    await fs.writeFile(join(distDir, 'cache', 'entry'), '')
    await fs.writeFile(join(distDir, 'lock'), '')
    await fs.writeFile(join(distDir, 'stale.js'), '')

    await cleanDistDir(distDir, ['cache', 'lock'])

    expect(await fs.pathExists(join(distDir, 'cache', 'entry'))).toBe(true)
    expect(await fs.pathExists(join(distDir, 'lock'))).toBe(true)
    expect(await fs.pathExists(join(distDir, 'stale.js'))).toBe(false)
  })

  it('always retains and rewrites the marker', async () => {
    await cleanDistDir(distDir, [])
    expect(await fs.pathExists(join(distDir, DIST_DIR_MARKER))).toBe(true)

    // A second clean must not delete the marker it wrote.
    await cleanDistDir(distDir, [])
    expect(await fs.pathExists(join(distDir, DIST_DIR_MARKER))).toBe(true)
  })

  it('creates the directory when it does not exist', async () => {
    const missing = join(projectDir, 'does-not-exist')

    await cleanDistDir(missing, [])

    expect(await fs.pathExists(join(missing, DIST_DIR_MARKER))).toBe(true)
  })
})
