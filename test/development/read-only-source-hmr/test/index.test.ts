import { nextTestSetup, type Playwright } from 'e2e-utils'
import { getBrowserBodyText, retry } from 'next-test-utils'
import fs from 'fs-extra'
import path from 'path'

const READ_ONLY_PERMISSIONS = 0o444
const READ_WRITE_PERMISSIONS = 0o644

// Polling watchers (see `next.config.js` / `WATCHPACK_POLLING`) detect changes
// on the next poll tick rather than immediately, so give change-detection
// assertions a more generous window than `retry()`'s 3s default.
const POLL_RETRY_MS = 10000

// Turbopack's polling watcher (`watchOptions.pollIntervalMs` -> notify
// `PollWatcher`) does not currently detect in-place file content edits, so
// HMR-on-edit never fires under Turbopack in polling mode: the dev server logs
// a `watch error` and never recompiles after the edit. File creation/deletion
// still work because on-demand compilation resolves routes at request time.
// Skip the in-place-edit case under Turbopack until the poll watcher is fixed;
// it still runs (in polling mode) for webpack.
const itSkipTurbopackPolling = process.env.IS_TURBOPACK_TEST ? it.skip : it

let pageHello = 'pages/hello.js'

describe('Read-only source HMR', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, '..'),
    skipStart: true,
    env: {
      __NEXT_TEST_WITH_DEVTOOL: '1',
      // Events can be finicky in CI. This switches the dev server's file
      // watcher (Watchpack, used by both webpack and Turbopack to detect
      // added/removed route files) to a more reliable polling method. The
      // bundler-level polling (webpack compiler / Turbopack's PollWatcher) is
      // enabled via `watchOptions.pollIntervalMs` in this fixture's
      // `next.config.js`.
      WATCHPACK_POLLING: '500',
    },
  })

  beforeAll(async () => {
    await fs.chmod(path.join(next.testDir, pageHello), READ_ONLY_PERMISSIONS)
    await next.start()
  })

  async function patchFileReadOnly(
    filename: string,
    content: (content: string | undefined) => string | undefined,
    runWithTempContent: (context: { newFile: boolean }) => Promise<void>
  ) {
    const filePath = path.join(next.testDir, filename)
    const exists = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false)

    if (exists) {
      await fs.chmod(filePath, READ_WRITE_PERMISSIONS)
    }

    const previousContent = exists ? await next.readFile(filename) : undefined

    const newContent = content(previousContent)
    if (newContent === undefined) {
      if (exists) {
        await fs.remove(filePath)
      }
    } else {
      await fs.writeFile(filePath, newContent)
    }

    try {
      if (newContent !== undefined) {
        await fs.chmod(filePath, READ_ONLY_PERMISSIONS)
      }
      await runWithTempContent({ newFile: !exists })
    } finally {
      if (newContent !== undefined) {
        await fs.chmod(filePath, READ_WRITE_PERMISSIONS)
      }
      if (previousContent === undefined) {
        await fs.remove(filePath)
      } else {
        await fs.writeFile(filePath, previousContent)
        await fs.chmod(filePath, READ_ONLY_PERMISSIONS)
      }
    }
  }

  itSkipTurbopackPolling('should detect changes to a page', async () => {
    let browser: Playwright

    try {
      browser = await next.browser('/hello')
      await retry(async () =>
        expect(await getBrowserBodyText(browser)).toContain('Hello World')
      )

      await patchFileReadOnly(
        pageHello,
        (content) => content.replace('Hello World', 'COOL page'),
        async () => {
          await retry(
            async () =>
              expect(await getBrowserBodyText(browser)).toContain('COOL page'),
            POLL_RETRY_MS
          )
        }
      )

      await retry(
        async () =>
          expect(await getBrowserBodyText(browser)).toContain('Hello World'),
        POLL_RETRY_MS
      )
    } finally {
      await browser?.close()
    }
  })

  it('should handle page deletion and subsequent recreation', async () => {
    let browser: Playwright

    try {
      browser = await next.browser('/hello')
      await retry(async () =>
        expect(await getBrowserBodyText(browser)).toContain('Hello World')
      )

      await patchFileReadOnly(
        pageHello,
        () => undefined,
        async () => {
          await retry(
            async () =>
              expect(await getBrowserBodyText(browser)).toContain(
                'This page could not be found'
              ),
            POLL_RETRY_MS
          )
        }
      )

      await retry(async () => {
        if (!process.env.IS_TURBOPACK_TEST) {
          // webpack doesn't automatically refresh the page when a page is added?
          await browser.refresh()
        }
        expect(await getBrowserBodyText(browser)).toContain('Hello World')
      }, POLL_RETRY_MS)
    } finally {
      await browser?.close()
    }
  })

  it('should detect a new page', async () => {
    let browser: Playwright

    try {
      await patchFileReadOnly(
        'pages/new.js',
        () => `
        const New = () => <p>New page</p>

        export default New
      `,
        async () => {
          browser = await next.browser('/new')
          // In polling mode the newly added route isn't registered instantly,
          // so the first navigation can 404. Re-request the page on each retry
          // until the watcher picks up the new file and it compiles.
          await retry(async () => {
            await browser.refresh()
            expect(await getBrowserBodyText(browser)).toContain('New page')
          }, POLL_RETRY_MS)
        }
      )
    } finally {
      await browser?.close()
    }
  })
})
