import fs from 'fs'
import os from 'os'
import path from 'path'
import { replaceFile } from '../lib/replace-file'

describe('replaceFile', () => {
  let rootDir: string
  let stagingDir: string
  let storePath: string
  let targetPath: string

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-replace-file-'))
    stagingDir = path.join(rootDir, 'staging')
    fs.mkdirSync(stagingDir)
    fs.mkdirSync(path.join(rootDir, 'app'))

    // Simulate a pnpm store file that is hard linked into the fixture.
    storePath = path.join(rootDir, 'store-file.js')
    targetPath = path.join(rootDir, 'app/page.js')
    fs.writeFileSync(storePath, 'original', { mode: 0o640 })
    fs.linkSync(storePath, targetPath)
  })

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  function replace(
    content: string,
    runWithTempContent?: (context: { newFile: boolean }) => Promise<void>,
    outputPath = targetPath
  ) {
    const stat = fs.statSync(outputPath, { throwIfNoEntry: false })
    return replaceFile({
      outputPath,
      stagingDir,
      content,
      mode: stat?.mode,
      newFile: stat === undefined,
      runWithTempContent,
    })
  }

  it('replaces a hard-linked file without modifying the linked original', async () => {
    const originalStat = fs.statSync(targetPath)

    await replace('patched')

    const targetStat = fs.statSync(targetPath)
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('patched')
    expect(fs.readFileSync(storePath, 'utf8')).toBe('original')
    expect(targetStat.ino).not.toBe(originalStat.ino)
    expect(targetStat.mode & 0o777).toBe(originalStat.mode & 0o777)
    expect(fs.readdirSync(stagingDir)).toEqual([])
  })

  it('never leaves the target missing', async () => {
    // Removing the target before writing the replacement would let file
    // watchers see the file being deleted and re-added. Check after every
    // filesystem mutation that the target still exists.
    const missingAfter: string[] = []
    const spies = (
      ['writeFileSync', 'linkSync', 'renameSync', 'rmSync'] as const
    ).map((method) => {
      const original = fs[method] as (...args: any[]) => any
      return jest.spyOn(fs, method).mockImplementation((...args: any[]) => {
        const result = original.apply(fs, args)
        if (!fs.existsSync(targetPath)) {
          missingAfter.push(method)
        }
        return result
      })
    })

    try {
      await replace('patched')
      await replace('temporary', async () => {})
    } finally {
      spies.forEach((spy) => spy.mockRestore())
    }

    expect(missingAfter).toEqual([])
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('patched')
  })

  it('restores the original inode after temporary content', async () => {
    const originalInode = fs.statSync(targetPath).ino

    await replace('temporary', async ({ newFile }) => {
      expect(newFile).toBe(false)
      expect(fs.readFileSync(targetPath, 'utf8')).toBe('temporary')
      expect(fs.readFileSync(storePath, 'utf8')).toBe('original')
    })

    expect(fs.readFileSync(targetPath, 'utf8')).toBe('original')
    expect(fs.statSync(targetPath).ino).toBe(originalInode)
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(['page.js'])
    expect(fs.readdirSync(stagingDir)).toEqual([])
  })

  it('restores the original when the temporary callback throws', async () => {
    const originalInode = fs.statSync(targetPath).ino

    await expect(
      replace('temporary', async () => {
        throw new Error('callback failed')
      })
    ).rejects.toThrow('callback failed')

    expect(fs.readFileSync(targetPath, 'utf8')).toBe('original')
    expect(fs.statSync(targetPath).ino).toBe(originalInode)
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(['page.js'])
    expect(fs.readdirSync(stagingDir)).toEqual([])
  })

  it('removes a temporary new file after the callback', async () => {
    const newPath = path.join(rootDir, 'app/new.js')

    await replace(
      'temporary',
      async ({ newFile }) => {
        expect(newFile).toBe(true)
        expect(fs.readFileSync(newPath, 'utf8')).toBe('temporary')
      },
      newPath
    )

    expect(fs.existsSync(newPath)).toBe(false)
    expect(fs.readdirSync(stagingDir)).toEqual([])
  })
})
