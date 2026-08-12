/* eslint-env jest */
import { promises } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ImageOptimizerCache } from 'next/dist/server/image-optimizer'
import { resetDiskLRU } from 'next/dist/server/lib/disk-lru-cache.external'
import { imageConfigDefault } from 'next/dist/shared/lib/image-config'
import type { NextConfigRuntime } from 'next/dist/server/config-shared'

async function writeEntry(
  cacheDir: string,
  key: string,
  size: number,
  expireAt: number
) {
  const dir = join(cacheDir, key)
  await promises.mkdir(dir, { recursive: true })
  await promises.writeFile(
    join(dir, `60.${expireAt}.etag.upstream.webp`),
    Buffer.alloc(size, 0x42)
  )
}

describe('image cache LRU initialization', () => {
  let distDir: string

  beforeEach(async () => {
    resetDiskLRU()
    distDir = await promises.mkdtemp(join(tmpdir(), 'next-image-cache-init-'))
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    resetDiskLRU()
    await promises.rm(distDir, { recursive: true, force: true })
  })

  it('uses file metadata to size existing entries without reading their bodies', async () => {
    const cacheDir = join(distDir, 'cache', 'images')
    const expireAt = Date.now() + 60_000
    await writeEntry(cacheDir, 'old', 400, expireAt)
    await writeEntry(cacheDir, 'new', 400, expireAt + 1)

    const readFile = jest.spyOn(promises, 'readFile')
    const cache = new ImageOptimizerCache({
      distDir,
      nextConfig: {
        images: {
          ...imageConfigDefault,
          maximumDiskCacheSize: 500,
        },
        experimental: {
          isrFlushToDisk: true,
        },
      } as NextConfigRuntime,
    })
    const lru = await (
      cache as unknown as {
        cacheDiskLRU: Promise<{
          has(key: string): boolean
        }>
      }
    ).cacheDiskLRU

    expect(readFile).not.toHaveBeenCalled()
    expect(lru.has('old')).toBe(false)
    expect(lru.has('new')).toBe(true)
  })
})
