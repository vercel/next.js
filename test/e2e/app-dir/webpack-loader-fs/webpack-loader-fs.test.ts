import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { utimes } from 'fs/promises'
import path from 'path'

describe('webpack-loader-fs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should allow reading the input FS', async () => {
    const $ = await next.render$('/')
    expect($('#test').text()).toBe(
      "Buffer read: 18, string read: 'this is some data', binary read: 6765, glob read: 'one.txt'"
    )
  })

  const readStat = async () => {
    const $ = await next.render$('/')
    return JSON.parse($('#stat').text())
  }

  const readParentStat = async () => {
    const $ = await next.render$('/parent')
    return JSON.parse($('#parent-stat').text())
  }

  it('exposes Node stat results, options, path types, and callback errors', async () => {
    const stat = await readStat()
    expect(stat).toMatchObject({
      file: true,
      directory: true,
      root: true,
      symlink: false,
      linkedDirectory: true,
      size: 6,
      date: true,
      bigint: 'bigint',
      bigintSize: '6',
      bufferSize: 6,
      urlSize: 6,
      matchesNode: true,
      missing: {
        code: 'ENOENT',
        syscall: 'stat',
        correctPath: true,
        matchesNode: true,
      },
      notDirectory: { syscall: 'stat', correctPath: true, matchesNode: true },
      notDirectoryDeep: {
        syscall: 'stat',
        correctPath: true,
        matchesNode: true,
      },
      missingParent:
        process.platform === 'win32'
          ? null
          : {
              code: 'ENOENT',
              syscall: 'stat',
              correctPath: true,
              matchesNode: true,
            },
      notDirectoryParent:
        process.platform === 'win32'
          ? null
          : { syscall: 'stat', correctPath: true, matchesNode: true },
      optional: 'missing',
    })
    expect(stat.mtimeMs).toEqual(expect.any(Number))
    expect(stat.mode).toEqual(expect.any(Number))
    expect(await readParentStat()).toMatchObject({
      parentSize: 6,
      relativeParentSize: 6,
      bufferParentSize: 6,
      parentMatchesNode: true,
    })
  })

  // Stat tracking is automatic in Turbopack; webpack loaders must register their own dependencies.
  // @force-gate dev && turbopack
  it('invalidates a stat-only read when the file size changes', async () => {
    await readStat()
    await next.patchFile('app/stat-target.bin', 'a longer file', async () => {
      await retry(async () => expect((await readStat()).size).toBe(13))
    })
    await retry(async () => expect((await readStat()).size).toBe(6))
  })

  // @force-gate dev && turbopack
  it('tracks metadata through a symlinked parent directory', async () => {
    const initial = await readStat()
    await next.patchFile(
      'app/glob-target/inner/path/one.txt',
      'a longer symlink target',
      async () => {
        await retry(async () => expect((await readStat()).linkedSize).toBe(23))
      }
    )
    await retry(async () =>
      expect((await readStat()).linkedSize).toBe(initial.linkedSize)
    )
  })

  // @force-gate dev && turbopack
  it('tracks the stat target after resolving a symlink followed by ..', async () => {
    const expectParentSize = async (size: number) => {
      expect(await readParentStat()).toMatchObject({
        parentSize: size,
        relativeParentSize: size,
        bufferParentSize: size,
      })
    }
    await expectParentSize(6)
    // Windows normalizes `..` before following directory symlinks; POSIX does not.
    const target =
      process.platform === 'win32'
        ? 'app/path/to/stat-parent-target.bin'
        : 'app/stat-parent-target.bin'
    await next.patchFile(target, 'a longer file', async () => {
      await retry(async () => expectParentSize(13))
    })
    await retry(async () => expectParentSize(6))
  })

  // @force-gate dev && turbopack
  it('invalidates metadata-only changes without reading file contents', async () => {
    const initial = await readStat()
    const target = path.join(next.testDir, 'app/stat-target.bin')
    const modified = new Date('2000-01-01T00:00:00Z')
    try {
      await utimes(target, modified, modified)
      await retry(async () =>
        expect((await readStat()).mtimeMs).toBe(modified.getTime())
      )
    } finally {
      const previous = new Date(initial.mtimeMs)
      await utimes(target, previous, previous)
    }
    await retry(async () =>
      expect((await readStat()).mtimeMs).not.toBe(modified.getTime())
    )
  })

  // @force-gate dev && turbopack
  it('tracks missing-path creation, file-to-directory replacement, and deletion', async () => {
    expect((await readStat()).optional).toBe('missing')
    await next.patchFile('app/optional.bin', 'created')
    try {
      await retry(async () => expect((await readStat()).optional).toBe('file'))
      await next.remove('app/optional.bin')
      await next.patchFile('app/optional.bin/child', 'child')
      await retry(async () =>
        expect((await readStat()).optional).toBe('directory')
      )
    } finally {
      await next.remove('app/optional.bin')
    }
    await retry(async () => expect((await readStat()).optional).toBe('missing'))
  })
})
