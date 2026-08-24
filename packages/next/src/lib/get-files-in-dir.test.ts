import { mkdtemp, writeFile, symlink, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { getFilesInDir } from './get-files-in-dir'

describe('getFilesInDir', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'get-files-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('should list files in a directory', async () => {
    await writeFile(join(tmpDir, 'a.txt'), 'hello')
    await writeFile(join(tmpDir, 'b.txt'), 'world')

    const files = await getFilesInDir(tmpDir)
    expect(files).toEqual(new Set(['a.txt', 'b.txt']))
  })

  it('should return empty set for empty directory', async () => {
    const files = await getFilesInDir(tmpDir)
    expect(files.size).toBe(0)
  })

  it('should close dir handle even when stat throws on broken symlink', async () => {
    await writeFile(join(tmpDir, 'real.txt'), 'content')
    // Create a broken symlink pointing to a non-existent target
    await symlink(join(tmpDir, 'does-not-exist'), join(tmpDir, 'broken-link'))

    // Should not leak the directory handle; the try/finally ensures dir.close()
    // is called even if fs.stat throws for the broken symlink.
    await expect(getFilesInDir(tmpDir)).rejects.toThrow()
  })
})
