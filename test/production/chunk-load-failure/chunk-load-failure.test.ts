import { nextTestSetup } from 'e2e-utils'
import path from 'path'
import fs from 'fs'
import { listClientChunks, retry } from 'next-test-utils'

describe('chunk-load-failure', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getNextDynamicChunk() {
    const browserChunks = await listClientChunks(
      path.join(next.testDir, next.distDir)
    )
    let nextDynamicChunks = browserChunks.filter(
      (f) =>
        /\.js$/.test(f) &&
        fs
          .readFileSync(path.join(next.testDir, next.distDir, f), 'utf8')
          .includes('this is a lazy loaded async component')
    )
    expect(nextDynamicChunks).toHaveLength(1)

    return nextDynamicChunks[0]
  }

  it('should report async chunk load failures', async () => {
    let nextDynamicChunk = await getNextDynamicChunk()

    let chunkRequestCount = 0
    let pageError: Error | undefined
    const browser = await next.browser('/dynamic', {
      beforePageLoad(page) {
        page.route(`**/${nextDynamicChunk}*`, async (route) => {
          chunkRequestCount++
          await route.abort('connectionreset')
        })
        page.on('pageerror', (error: Error) => {
          pageError = error
        })
      },
    })

    await retry(async () => {
      const body = await browser.elementByCss('body')
      // Client errors show "This page couldn\u2019t load"
      expect(await body.text()).toMatch(/This page couldn\u2019t load/)
    })

    expect(pageError).toBeDefined()
    expect(pageError.name).toBe('ChunkLoadError')
    if (process.env.IS_TURBOPACK_TEST) {
      // Turbopack retries a failed chunk load once before giving up: one initial
      // request plus one retry.
      expect(chunkRequestCount).toBe(2)
      expect(pageError.message).toStartWith(
        'Failed to load chunk /_next/' + nextDynamicChunk
      )
    } else {
      // Webpack does not retry yet, so the failure surfaces on the first request.
      expect(chunkRequestCount).toBe(1)
      expect(pageError.message).toMatch(/^Loading chunk \S+ failed./)
      expect(pageError.message).toContain('/_next/' + nextDynamicChunk)
    }
  })

  // Turbopack-only: webpack does not retry chunk loads yet, so a transient
  // failure there surfaces immediately as a ChunkLoadError.
  /* eslint-disable jest/no-standalone-expect */
  ;(process.env.IS_TURBOPACK_TEST ? it : it.skip)(
    'should recover after a transient async chunk load failure',
    async () => {
      let nextDynamicChunk = await getNextDynamicChunk()

      let chunkRequestCount = 0
      let pageError: Error | undefined
      const browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          page.route(`**/${nextDynamicChunk}*`, async (route) => {
            chunkRequestCount++
            // Fail only the first attempt; let the retry through.
            if (chunkRequestCount === 1) {
              await route.abort('connectionreset')
              return
            }
            await route.continue()
          })
          page.on('pageerror', (error: Error) => {
            pageError = error
          })
        },
      })

      await retry(async () => {
        const body = await browser.elementByCss('body')
        expect(await body.text()).toContain(
          'this is a lazy loaded async component'
        )
      })

      // One initial request that failed + one retry that succeeded.
      expect(chunkRequestCount).toBe(2)
      expect(pageError).toBeUndefined()
    }
  )
  /* eslint-enable jest/no-standalone-expect */

  it('should report aborted chunks when navigating away', async () => {
    let nextDynamicChunk = await getNextDynamicChunk()

    let resolve
    try {
      const browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          page.route(`**/${nextDynamicChunk}*`, async (route) => {
            // deterministically ensure that the async chunk is still loading during the navigation
            await new Promise((r) => {
              resolve = r
            })
          })
          page.on('pageerror', (error: Error) => {
            console.log('pageerror', error)
          })
        },
      })

      await browser.get(next.url + '/other')

      let body = await browser.elementByCss('body')
      expect(await body.text()).toMatch('this is other')

      const browserLogs = (await browser.log()).filter(
        (m) => m.source === 'warning' || m.source === 'error'
      )

      if (process.env.BROWSER_NAME === 'firefox') {
        expect(browserLogs).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining(
              'Loading failed for the <script> with source'
            ),
          })
        )
      } else {
        // Chrome and Safari doesn't show any errors or warnings here
        expect(browserLogs).toBeEmpty()
      }
    } finally {
      // prevent hanging
      resolve?.()
    }
  })
})
