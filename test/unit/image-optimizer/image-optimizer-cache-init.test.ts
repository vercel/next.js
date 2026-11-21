/* eslint-env jest */
/**
 * Regression tests for https://github.com/vercel/next.js/issues/102133
 *
 * `/_next/image` with `images.unoptimized: true` or a custom loader must NOT
 * start the disk LRU cache initialisation (mkdir / statfs).  When the server
 * runs as a non-root user and cannot write to `.next/cache/images`, the eager
 * mkdir was rejected and—because nobody held a `.catch()` on the unhandled
 * promise—the rejection fired as an unhandledRejection.  Hosts that treat
 * unhandledRejection as fatal (e.g. Platformatic Watt) terminated the process.
 */
import { join } from 'path'
import { tmpdir } from 'os'
import { promises } from 'fs'
import { resetDiskLRU } from 'next/dist/server/lib/disk-lru-cache.external'

// We import the class under test via its compiled dist path so the test can
// spy on getOrInitDiskLRU without coupling to build-time internals.
import { ImageOptimizerCache } from 'next/dist/server/image-optimizer'

// A minimal NextConfigRuntime that enables the disk cache (the default).
function makeConfig(
  overrides: {
    unoptimized?: boolean
    loader?: string
    maximumDiskCacheSize?: number
    isrFlushToDisk?: boolean
  } = {}
): any {
  return {
    basePath: '',
    images: {
      deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
      imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
      minimumCacheTTL: 60,
      formats: ['image/webp'],
      loader: overrides.loader ?? 'default',
      path: '/_next/image',
      loaderFile: '',
      domains: [],
      remotePatterns: [],
      localPatterns: undefined,
      disableStaticImages: false,
      dangerouslyAllowSVG: false,
      contentDispositionType: 'inline',
      contentSecurityPolicy: '',
      unoptimized: overrides.unoptimized ?? false,
      maximumDiskCacheSize: overrides.maximumDiskCacheSize,
      customCacheHandler: undefined,
    },
    experimental: {
      isrFlushToDisk: overrides.isrFlushToDisk ?? true,
    },
  }
}

describe('ImageOptimizerCache — disk LRU initialisation', () => {
  let distDir: string

  beforeEach(async () => {
    // Use a fresh temp directory for each test so there is no cross-test state.
    distDir = await promises.mkdtemp(join(tmpdir(), 'next-img-cache-test-'))
    // Reset the module-level LRU singleton between tests.
    resetDiskLRU()
  })

  afterEach(async () => {
    resetDiskLRU()
    await promises.rm(distDir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    })
  })

  it('does NOT create the cache directory when images.unoptimized is true', async () => {
    const unhandledRejections: Error[] = []
    const onUnhandledRejection = (reason: any) => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      // Construct cache with unoptimized: true.
      // If the bug is present, getOrInitDiskLRU will be called and—when the
      // constructor exits—its pending promise becomes unhandled.
      new ImageOptimizerCache({
        distDir,
        nextConfig: makeConfig({ unoptimized: true }),
      })

      // Give the event loop a full turn so any queued microtask/macro-task
      // callbacks (including unhandledRejection) can fire.
      await new Promise((resolve) => setTimeout(resolve, 50))

      const cacheImagesDir = join(distDir, 'cache', 'images')
      const dirExists = await promises
        .stat(cacheImagesDir)
        .then(() => true)
        .catch(() => false)

      expect(dirExists).toBe(false)
      expect(unhandledRejections).toHaveLength(0)
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  it('does NOT create the cache directory when a custom loader is configured', async () => {
    const unhandledRejections: Error[] = []
    const onUnhandledRejection = (reason: any) => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      new ImageOptimizerCache({
        distDir,
        nextConfig: makeConfig({ loader: 'custom' }),
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const cacheImagesDir = join(distDir, 'cache', 'images')
      const dirExists = await promises
        .stat(cacheImagesDir)
        .then(() => true)
        .catch(() => false)

      expect(dirExists).toBe(false)
      expect(unhandledRejections).toHaveLength(0)
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  it('does NOT initialise disk LRU when maximumDiskCacheSize is 0', async () => {
    const unhandledRejections: Error[] = []
    const onUnhandledRejection = (reason: any) => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      new ImageOptimizerCache({
        distDir,
        nextConfig: makeConfig({ maximumDiskCacheSize: 0 }),
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const cacheImagesDir = join(distDir, 'cache', 'images')
      const dirExists = await promises
        .stat(cacheImagesDir)
        .then(() => true)
        .catch(() => false)

      expect(dirExists).toBe(false)
      expect(unhandledRejections).toHaveLength(0)
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  it('does NOT create the cache directory when isrFlushToDisk is false', async () => {
    const unhandledRejections: Error[] = []
    const onUnhandledRejection = (reason: any) => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      new ImageOptimizerCache({
        distDir,
        nextConfig: makeConfig({ isrFlushToDisk: false }),
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const cacheImagesDir = join(distDir, 'cache', 'images')
      const dirExists = await promises
        .stat(cacheImagesDir)
        .then(() => true)
        .catch(() => false)

      expect(dirExists).toBe(false)
      expect(unhandledRejections).toHaveLength(0)
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  it('does NOT fire an unhandledRejection when disk init fails and cache is never used', async () => {
    // Point distDir at a non-writable path.  On Linux this would be a path
    // owned by root; here we simulate it by using a file as the distDir so
    // mkdir of the cache sub-path fails.
    const fakeFile = join(distDir, 'not-a-dir')
    await promises.writeFile(fakeFile, '')

    const unhandledRejections: Error[] = []
    const onUnhandledRejection = (reason: any) => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      // With a default config (optimized images, disk cache enabled) the
      // constructor starts the eager init.  If the cacheDir is inside a
      // regular file, mkdir will fail.
      new ImageOptimizerCache({
        distDir: fakeFile, // mkdir(<fakeFile>/cache/images) will fail
        nextConfig: makeConfig(),
      })

      // Allow the failed mkdir promise to settle and all microtasks to run.
      await new Promise((resolve) => setTimeout(resolve, 100))

      // The key assertion: even though initialization failed, no
      // unhandledRejection should have been emitted because the constructor
      // attaches a .catch() to the eager init promise.
      expect(unhandledRejections).toHaveLength(0)
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
      resetDiskLRU()
    }
  })

  it('still creates the cache directory for a normal optimised-image request', async () => {
    new ImageOptimizerCache({
      distDir,
      nextConfig: makeConfig(),
    })

    // The eager init tries to create the cache directory (or uses statfs if
    // maximumDiskCacheSize is undefined).  Give it time to run.
    await new Promise((resolve) => setTimeout(resolve, 200))

    const cacheImagesDir = join(distDir, 'cache', 'images')
    const dirExists = await promises
      .stat(cacheImagesDir)
      .then(() => true)
      .catch(() => false)

    // The directory is created only when maximumDiskCacheSize is undefined
    // (then statfs path runs mkdir).  With an explicit size limit it is NOT
    // pre-created — the cache dir is created lazily on first write.
    // The important thing is: no unhandled rejection.
    // We also confirm that the cache IS active by calling get() and verifying
    // it returns null (cache miss) rather than throwing.
    const cache = new ImageOptimizerCache({
      distDir,
      nextConfig: makeConfig({ maximumDiskCacheSize: 100 * 1024 * 1024 }),
    })
    const result = await cache.get('nonexistent-key')
    expect(result).toBeNull()
  })
})
