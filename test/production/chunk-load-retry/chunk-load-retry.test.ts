import { nextTestSetup } from 'e2e-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import path from 'path'
import fs from 'fs'
import { retry } from 'next-test-utils'

describe('chunk-load-retry', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  /**
   * Find the chunk file that contains the lazy component
   */
  async function getLazyComponentChunk() {
    const chunksPath = path.join(next.testDir, '.next/static/')
    const browserChunks = await recursiveReadDir(chunksPath, {
      pathnameFilter: (f) => /\.js$/.test(f),
    })
    const lazyChunks = browserChunks.filter((f) =>
      fs
        .readFileSync(path.join(chunksPath, f), 'utf8')
        .includes('CHUNK_LOAD_RETRY_TEST_MARKER')
    )
    expect(lazyChunks).toHaveLength(1)
    return lazyChunks[0]
  }

  describe('Automatic Retry', () => {
    it('should retry chunk load and succeed when first request fails but second succeeds', async () => {
      const lazyChunk = await getLazyComponentChunk()

      let requestCount = 0
      const browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          // Fail the first request, allow the second
          page.route('**/' + lazyChunk, async (route) => {
            requestCount++
            if (requestCount === 1) {
              // First request fails
              await route.abort('connectionreset')
            } else {
              // Second request succeeds (retry)
              await route.continue()
            }
          })
        },
      })

      // Should eventually show the lazy component after retry
      await retry(async () => {
        const lazyComponent = await browser.elementByCss(
          '[data-testid="lazy-component"]'
        )
        expect(await lazyComponent.text()).toContain(
          'CHUNK_LOAD_RETRY_TEST_MARKER'
        )
      })

      // Verify that retry actually happened (2 requests: 1 failed + 1 succeeded)
      expect(requestCount).toBe(2)
    })

    it('should propagate error when both initial and retry requests fail', async () => {
      const lazyChunk = await getLazyComponentChunk()

      let pageError: Error | undefined
      let requestCount = 0
      const _browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          // Fail all requests
          page.route('**/' + lazyChunk, async (route) => {
            requestCount++
            await route.abort('connectionreset')
          })
          page.on('pageerror', (error: Error) => {
            pageError = error
          })
        },
      })

      // Wait for the error to occur
      await retry(async () => {
        expect(pageError).toBeDefined()
      })

      // Verify the error is a ChunkLoadError
      expect(pageError!.name).toBe('ChunkLoadError')

      // Verify that retry was attempted (at least 2 requests: initial + retry)
      expect(requestCount).toBeGreaterThanOrEqual(2)
    })

    it('should not retry more than once per loader', async () => {
      const lazyChunk = await getLazyComponentChunk()

      let requestCount = 0
      await next.browser('/dynamic', {
        beforePageLoad(page) {
          // Fail all requests
          page.route('**/' + lazyChunk, async (route) => {
            requestCount++
            await route.abort('connectionreset')
          })
        },
      })

      // Wait a bit for all retries to complete
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Should only have 2 requests: initial + one retry
      // (retry logic only retries once per loader instance)
      expect(requestCount).toBe(2)
    })
  })

  describe('Cache Clearing', () => {
    it('should clear chunk cache before retry to allow fresh fetch', async () => {
      const lazyChunk = await getLazyComponentChunk()

      let requestCount = 0
      const browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          // Fail the first request, allow subsequent
          page.route('**/' + lazyChunk, async (route) => {
            requestCount++
            if (requestCount === 1) {
              await route.abort('connectionreset')
            } else {
              await route.continue()
            }
          })
        },
      })

      // Should eventually load after retry
      await retry(async () => {
        const lazyComponent = await browser.elementByCss(
          '[data-testid="lazy-component"]'
        )
        expect(await lazyComponent.text()).toContain(
          'CHUNK_LOAD_RETRY_TEST_MARKER'
        )
      })

      // The second request proves the cache was cleared,
      // otherwise webpack would return the cached rejected promise
      expect(requestCount).toBe(2)
    })
  })
})
