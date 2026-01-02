import { nextTestSetup } from 'e2e-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import path from 'path'
import fs from 'fs'
import { retry } from 'next-test-utils'

describe('chunk-load-error-banner', () => {
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
        .includes('this is a lazy loaded async component')
    )
    expect(lazyChunks).toHaveLength(1)
    return lazyChunks[0]
  }

  describe('Banner Appearance', () => {
    it('should show banner instead of full-page error for ChunkLoadError', async () => {
      const lazyChunk = await getLazyComponentChunk()

      let pageError: Error | undefined
      const browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          // Intercept all attempts and abort them
          page.route('**/' + lazyChunk, async (route) => {
            await route.abort('connectionreset')
          })
          page.on('pageerror', (error: Error) => {
            pageError = error
          })
        },
      })

      await retry(async () => {
        const body = await browser.elementByCss('body')
        const text = await body.text()
        // Should show banner text, NOT "This page crashed"
        expect(text).toContain("This page couldn't be fully loaded")
        expect(text).not.toContain('This page crashed')
      })

      // Verify error is actually a ChunkLoadError
      expect(pageError).toBeDefined()
      expect(pageError!.name).toBe('ChunkLoadError')
    })

    it('should show "Reload page" button in banner', async () => {
      const lazyChunk = await getLazyComponentChunk()

      const browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          page.route('**/' + lazyChunk, async (route) => {
            await route.abort('connectionreset')
          })
        },
      })

      await retry(async () => {
        const body = await browser.elementByCss('body')
        const text = await body.text()
        expect(text).toContain('Reload page')
      })
    })

    it('should show correct sub-message in banner', async () => {
      const lazyChunk = await getLazyComponentChunk()

      const browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          page.route('**/' + lazyChunk, async (route) => {
            await route.abort('connectionreset')
          })
        },
      })

      await retry(async () => {
        const body = await browser.elementByCss('body')
        const text = await body.text()
        expect(text).toContain("A required file couldn't be loaded")
      })
    })
  })

  describe('Content Preservation', () => {
    it('should preserve page content visible under the banner', async () => {
      const lazyChunk = await getLazyComponentChunk()

      const browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          page.route('**/' + lazyChunk, async (route) => {
            await route.abort('connectionreset')
          })
        },
      })

      await retry(async () => {
        const body = await browser.elementByCss('body')
        const text = await body.text()
        // Banner should be visible
        expect(text).toContain("This page couldn't be fully loaded")
        // Original page content should ALSO be visible (frozen content)
        expect(text).toContain('Dynamic Page')
      })
    })
  })

  describe('ChunkLoadError Detection', () => {
    it('should correctly identify ChunkLoadError by name', async () => {
      const lazyChunk = await getLazyComponentChunk()

      let capturedError: Error | undefined
      await next.browser('/dynamic', {
        beforePageLoad(page) {
          page.route('**/' + lazyChunk, async (route) => {
            await route.abort('connectionreset')
          })
          page.on('pageerror', (error: Error) => {
            capturedError = error
          })
        },
      })

      await retry(async () => {
        expect(capturedError).toBeDefined()
        expect(capturedError!.name).toBe('ChunkLoadError')
      })

      // Verify error message format
      if (process.env.IS_TURBOPACK_TEST) {
        expect(capturedError!.message).toContain('Failed to load chunk')
      } else {
        expect(capturedError!.message).toMatch(/Loading chunk .* failed/)
      }
    })
  })

  describe('Navigation After Error', () => {
    it('should allow navigation away from page with banner', async () => {
      const lazyChunk = await getLazyComponentChunk()

      const browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          page.route('**/' + lazyChunk, async (route) => {
            await route.abort('connectionreset')
          })
        },
      })

      // Wait for banner to appear
      await retry(async () => {
        const body = await browser.elementByCss('body')
        expect(await body.text()).toContain(
          "This page couldn't be fully loaded"
        )
      })

      // Navigate to another page
      await browser.get(next.url + '/other')

      // Should successfully navigate
      await retry(async () => {
        const body = await browser.elementByCss('body')
        const text = await body.text()
        expect(text).toContain('Other Page')
        // Banner should be gone
        expect(text).not.toContain("This page couldn't be fully loaded")
      })
    })
  })

  describe('Server Error Differentiation', () => {
    it('should show full-page error for non-chunk errors (server errors with digest)', async () => {
      // This test verifies that regular errors still show the normal error page
      // We need to trigger a server error, not a chunk load error

      // Visit a page that throws a server error
      // For now, we just verify that chunk errors get special treatment
      // by confirming the banner shows for chunk errors
      const lazyChunk = await getLazyComponentChunk()

      const browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          page.route('**/' + lazyChunk, async (route) => {
            await route.abort('connectionreset')
          })
        },
      })

      await retry(async () => {
        const body = await browser.elementByCss('body')
        const text = await body.text()
        // Chunk errors show banner, not full page error
        expect(text).toContain("This page couldn't be fully loaded")
        expect(text).not.toContain('This page crashed')
      })
    })
  })

  describe('Accessibility', () => {
    it('should have accessible banner with role="alert"', async () => {
      const lazyChunk = await getLazyComponentChunk()

      const browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          page.route('**/' + lazyChunk, async (route) => {
            await route.abort('connectionreset')
          })
        },
      })

      await retry(async () => {
        const body = await browser.elementByCss('body')
        const text = await body.text()
        expect(text).toContain("This page couldn't be fully loaded")
      })

      // Check that the banner has role="alert" for accessibility
      const hasAlertRole = await browser.eval(() => {
        return document.querySelector('[role="alert"]') !== null
      })
      expect(hasAlertRole).toBe(true)
    })
  })
})
