/* eslint-env jest */
import fs from 'fs-extra'
import {
  recursiveDeleteSyncWithAsyncRetries,
  calcBackoffMs,
} from 'next/dist/lib/recursive-delete'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { recursiveCopy } from 'next/dist/lib/recursive-copy'
import { join } from 'path'

const resolveDataDir = join(__dirname, 'isolated', '_resolvedata')
const testResolveDataDir = join(__dirname, 'isolated', 'test_resolvedata')
const testpreservefileDir = join(__dirname, 'isolated', 'preservefiles')

describe('recursiveDeleteSyncWithAsyncRetries', () => {
  if (process.platform === 'win32') {
    it('should skip on windows to avoid symlink issues', () => {})
    return
  }

  it('should work', async () => {
    expect.assertions(1)
    try {
      await recursiveCopy(resolveDataDir, testResolveDataDir)
      await fs.symlink('./aa', join(testResolveDataDir, 'symlink'))
      await recursiveDeleteSyncWithAsyncRetries(testResolveDataDir)
      const result = await recursiveReadDir(testResolveDataDir)
      expect(result.length).toBe(0)
    } finally {
      await recursiveDeleteSyncWithAsyncRetries(testResolveDataDir)
    }
  })

  it('should exclude', async () => {
    expect.assertions(2)
    try {
      await recursiveCopy(resolveDataDir, testpreservefileDir, {
        overwrite: true,
      })
      // preserve cache dir
      await recursiveDeleteSyncWithAsyncRetries(testpreservefileDir, /^cache/)

      const result = await recursiveReadDir(testpreservefileDir)
      expect(result.length).toBe(1)
    } finally {
      // Ensure test cleanup
      await recursiveDeleteSyncWithAsyncRetries(testpreservefileDir)

      const cleanupResult = await recursiveReadDir(testpreservefileDir)
      expect(cleanupResult.length).toBe(0)
    }
  })

  it('should only delete files older than maxAgeMs, and empty out dirs', async () => {
    const dir = join(__dirname, 'isolated', 'ttl')
    try {
      await fs.outputFile(join(dir, 'stale', 'old.js'), 'old')
      await fs.outputFile(join(dir, 'fresh', 'new.js'), 'new')
      await fs.outputFile(join(dir, 'mixed', 'old.js'), 'old')
      await fs.outputFile(join(dir, 'mixed', 'new.js'), 'new')

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      for (const p of ['stale/old.js', 'mixed/old.js']) {
        await fs.utimes(join(dir, p), weekAgo, weekAgo)
      }

      await recursiveDeleteSyncWithAsyncRetries(dir, undefined, 60 * 60 * 1000)

      expect((await recursiveReadDir(dir)).sort()).toEqual([
        '/fresh/new.js',
        '/mixed/new.js',
      ])
      // `stale` held nothing but stale files, so the directory goes too
      expect(await fs.pathExists(join(dir, 'stale'))).toBe(false)
    } finally {
      await recursiveDeleteSyncWithAsyncRetries(dir)
    }
  })
})

describe('calcBackoffMs', () => {
  it('returns expected values', () => {
    let backoffValuesMs = Array.from({ length: 6 }, (_, attempt) =>
      calcBackoffMs(attempt)
    )
    expect(backoffValuesMs).toEqual([8, 16, 32, 64, 64, 64])
  })
})
