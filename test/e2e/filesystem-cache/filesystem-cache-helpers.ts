// Shared setup for the `filesystem-cache-*.test.ts` suites. The suites are
// split across several files so CI can distribute them across shards; they all
// use this directory as their fixture.
import { nextTestSetup, isNextDev } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import fs from 'fs/promises'
import path from 'path'
import { getPnpmRealpathWorkaround } from '../../lib/pnpm-realpath-workaround'

async function getDirectorySize(dirPath: string): Promise<number> {
  try {
    await fs.access(dirPath)
  } catch {
    return 0
  }
  let totalSize = 0
  const entries = await fs.readdir(dirPath, {
    recursive: true,
    withFileTypes: true,
  })
  for (const entry of entries) {
    if (entry.isFile()) {
      const filePath = path.join(entry.parentPath ?? entry.path, entry.name)
      const stat = await fs.stat(filePath)
      totalSize += stat.size
    }
  }
  return totalSize
}

export const CHANGE_NAMES = [
  'RSC change',
  'RCC change',
  'Pages change',
  'rename app page',
  'loader change',
  'next config change',
  'env var change',
] as const

export type ChangeName = (typeof CHANGE_NAMES)[number]

interface Change {
  checkInitial(): Promise<void>
  withChange(previous: () => Promise<void>): Promise<void>
  checkChanged(): Promise<void>
  fullInvalidation?: boolean
  largeCacheIncrease?: boolean
}

/**
 * Sets up a filesystem-cache test suite. Must be called inside a `describe`
 * block: it registers the `nextTestSetup` hooks plus hooks that give every
 * test a freshly (re)started server.
 */
export function setupFilesystemCacheTest(cacheEnabled: boolean) {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_ENV_VAR = 'hello world'
  })
  afterAll(() => {
    delete process.env.NEXT_PUBLIC_ENV_VAR
  })

  const env = {
    ENABLE_CACHING: cacheEnabled ? '1' : '',
    // Make it easier to run in development, test directories are cleared between runs already so this is safe.
    TURBO_ENGINE_IGNORE_DIRTY: '1',
    // decrease the idle timeout to make the test more reliable
    TURBO_ENGINE_SNAPSHOT_IDLE_TIMEOUT_MILLIS: '1000',
    // persist even tiny snapshots so the test doesn't depend on the
    // minimum-compilation-time threshold
    TURBO_ENGINE_SNAPSHOT_MIN_ACTIVE_TIME_MILLIS: '0',
  }

  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    overrideFiles: getPnpmRealpathWorkaround(),
    // Pass the cache setting through every harness-managed build and restart.
    env,
  })

  beforeAll(() => {
    // We can skip the dev watch delay since this is not an HMR test
    ;(next as any).handleDevWatchDelayBeforeChange = () => {}
    ;(next as any).handleDevWatchDelayAfterChange = () => {}
  })

  async function restartCycle(): Promise<number> {
    await stop()
    const cacheSize = await getCacheSize()
    await start()
    return cacheSize
  }

  async function stop() {
    if (isNextDev) {
      // Give FileSystem Cache time to write to disk
      // Turbopack is configured to wait 1s above.
      // Webpack has an idle timeout (after large changes) of 1s
      // and we give time a bit more to allow writing to disk
      await waitFor(3000)
    }
    await next.stop()
  }

  async function start() {
    await next.start()
  }

  async function getCacheSize(): Promise<number> {
    return getDirectorySize(
      path.join(next.testDir, '.next', 'cache', 'turbopack')
    )
  }

  // Ensure each test starts with a fresh server and no test leaks a
  // running server into the next one.
  beforeEach(async () => {
    // stop() is a no-op if already stopped; start() rebuilds + starts.
    await stop()
    await start()
  })
  afterEach(async () => {
    await stop()
  })

  function makeTextCheck(url: string, text: string) {
    return textCheck.bind(null, url, text)
  }

  async function textCheck(url: string, text: string) {
    const browser = await next.browser(url)
    expect(await browser.elementByCss('p').text()).toBe(text)
    await browser.close()
  }

  function makeFileEdit(file: string) {
    return async (inner: () => Promise<void>) => {
      await next.patchFile(
        file,
        (content) => {
          return content.replace('hello world', 'hello filesystem cache')
        },
        inner
      )
    }
  }

  const POTENTIAL_CHANGES: Record<ChangeName, Change> = {
    'RSC change': {
      checkInitial: makeTextCheck('/', 'hello world'),
      withChange: makeFileEdit('app/page.tsx'),
      checkChanged: makeTextCheck('/', 'hello filesystem cache'),
    },
    'RCC change': {
      checkInitial: makeTextCheck('/client', 'hello world'),
      withChange: makeFileEdit('app/client/page.tsx'),
      checkChanged: makeTextCheck('/client', 'hello filesystem cache'),
    },
    'Pages change': {
      checkInitial: makeTextCheck('/pages', 'hello world'),
      withChange: makeFileEdit('pages/pages.tsx'),
      checkChanged: makeTextCheck('/pages', 'hello filesystem cache'),
    },
    'rename app page': {
      checkInitial: makeTextCheck('/remove-me', 'hello world'),
      async withChange(inner) {
        await next.renameFolder('app/remove-me', 'app/add-me')
        try {
          await inner()
        } finally {
          await next.renameFolder('app/add-me', 'app/remove-me')
        }
      },
      checkChanged: makeTextCheck('/add-me', 'hello world'),
      largeCacheIncrease: true,
    },
    'loader change': {
      async checkInitial() {
        await textCheck('/loader', 'hello world')
        await textCheck('/loader/client', 'hello world')
      },
      withChange: makeFileEdit('my-loader.js'),
      async checkChanged() {
        await textCheck('/loader', 'hello filesystem cache')
        await textCheck('/loader/client', 'hello filesystem cache')
      },
      fullInvalidation: !isTurbopack,
    },
    'next config change': {
      async checkInitial() {
        await textCheck('/next-config', 'hello world')
        await textCheck('/next-config/client', 'hello world')
      },
      withChange: makeFileEdit('next.config.js'),
      async checkChanged() {
        await textCheck('/next-config', 'hello filesystem cache')
        await textCheck('/next-config/client', 'hello filesystem cache')
      },
      fullInvalidation: !isTurbopack,
    },
    'env var change': {
      async checkInitial() {
        await textCheck('/env', 'hello world')
        await textCheck('/env/client', 'hello world')
      },
      async withChange(inner) {
        process.env.NEXT_PUBLIC_ENV_VAR = 'hello filesystem cache'
        try {
          await inner()
        } finally {
          process.env.NEXT_PUBLIC_ENV_VAR = 'hello world'
        }
      },
      async checkChanged() {
        await textCheck('/env', 'hello filesystem cache')
        await textCheck('/env/client', 'hello filesystem cache')
      },
    },
  }

  let cacheWarmUpRegistered = false
  /**
   * The "change files while stopped" tests assert that the cache doesn't grow
   * much across restarts. The cache written by the very first builds is
   * noticeably smaller than its steady-state size, so warm it up with a few
   * build/restart cycles first. (When all of these tests lived in a single
   * file, the loader test that ran first in each suite did this implicitly.)
   */
  function registerCacheWarmUp() {
    if (!cacheEnabled || cacheWarmUpRegistered) return
    cacheWarmUpRegistered = true
    beforeAll(async () => {
      for (const url of ['/', '/unchanged', '/client', '/pages']) {
        const browser = await next.browser(url)
        await browser.elementByCss('main').text()
        await browser.close()
      }
      for (let i = 0; i < 2; i++) {
        await restartCycle()
      }
    })
  }

  /**
   * Registers a test that applies all the given changes while the server is
   * stopped and checks that they are picked up after a restart (and reverted
   * correctly afterwards).
   */
  function testChangesWhileStopped(changeNames: readonly ChangeName[]) {
    registerCacheWarmUp()

    // TODO fix loader changes with Turbopack. Exclude them from combined tests
    // as well as individual tests, without leaving undefined change entries.
    changeNames = changeNames.filter(
      (changeName) => changeName !== 'loader change' || !isTurbopack
    )
    const name = changeNames.join(', ')
    const changes = changeNames.map(
      (changeName) => POTENTIAL_CHANGES[changeName]
    )

    // Very flakey with Webpack enabled
    ;(process.env.IS_TURBOPACK_TEST ? it : it.skip)(
      `should allow to change files while stopped (${name})`,
      async () => {
        let fullInvalidation = !cacheEnabled
        let largeCacheIncrease = false
        for (const change of changes) {
          await change.checkInitial()
          if (change.fullInvalidation) {
            fullInvalidation = true
          }
          if (change.largeCacheIncrease) {
            largeCacheIncrease = true
          }
        }

        let unchangedTimestamp: string
        if (!fullInvalidation) {
          const browser = await next.browser('/unchanged')
          unchangedTimestamp = await browser.elementByCss('main').text()
          expect(unchangedTimestamp).toMatch(/Timestamp = \d+$/)
          await browser.close()
        }

        async function checkChanged() {
          for (const change of changes) {
            await change.checkChanged()
          }

          if (!fullInvalidation) {
            const browser = await next.browser('/unchanged')
            const timestamp = await browser.elementByCss('main').text()
            expect(unchangedTimestamp).toEqual(timestamp)
            await browser.close()
          }
        }

        await stop()
        const initialCacheSize = await getCacheSize()

        async function inner() {
          await start()
          await checkChanged()
          // Some no-op change builds
          for (let i = 0; i < 2; i++) {
            await restartCycle()
            await checkChanged()
          }
          await stop()
        }

        let current = inner
        for (const change of changes) {
          const prev = current
          current = () => change.withChange(prev)
        }
        await current()

        if (cacheEnabled) {
          const finalCacheSize = await getCacheSize()
          const maxIncrease = largeCacheIncrease ? 1.5 : 1.1
          const increasePercent = (
            (finalCacheSize / initialCacheSize - 1) *
            100
          ).toFixed(2)
          console.log(
            `Cache size (${name}): ${(initialCacheSize / 1024 / 1024).toFixed(2)} MB -> ${(finalCacheSize / 1024 / 1024).toFixed(2)} MB (${increasePercent}%)`
          )
          expect(finalCacheSize).toBeLessThanOrEqual(
            initialCacheSize * maxIncrease
          )
        }

        await start()
        for (const change of changes) {
          await change.checkInitial()
        }

        if (!fullInvalidation) {
          const browser = await next.browser('/unchanged')
          const timestamp = await browser.elementByCss('main').text()
          expect(unchangedTimestamp).toEqual(timestamp)
          await browser.close()
        }
      },
      200000
    )
  }

  return {
    next,
    stop,
    restartCycle,
    testChangesWhileStopped,
  }
}
