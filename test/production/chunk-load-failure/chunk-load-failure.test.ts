import { nextTestSetup } from 'e2e-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import path from 'path'
import fs from 'fs'
import { retry } from 'next-test-utils'

describe('chunk-load-failure', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getChunkContainingText(marker: string) {
    const chunksPath = path.join(next.testDir, '.next/static/')
    const browserChunks = await recursiveReadDir(chunksPath, {
      pathnameFilter: (f) => /\.js$/.test(f),
    })
    let nextDynamicChunks = browserChunks.filter((f) =>
      fs.readFileSync(path.join(chunksPath, f), 'utf8').includes(marker)
    )
    expect(nextDynamicChunks).toHaveLength(1)

    return nextDynamicChunks[0]
  }

  it('should report async chunk load failures', async () => {
    let nextDynamicChunk = await getChunkContainingText(
      'this is a lazy loaded async component'
    )

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

    // One initial request + one retry attempt.
    expect(chunkRequestCount).toBe(2)
    expect(pageError).toBeDefined()
    expect(pageError.name).toBe('ChunkLoadError')
    // Depending on the runner mode and runtime path, both webpack-style
    // and turbopack-style ChunkLoadError message formats are valid.
    expect(pageError.message).toContain('/_next/static/' + nextDynamicChunk)
    expect(pageError.message).toMatch(
      /^(?:Loading chunk \S+ failed\.|Failed to load chunk \/_next\/static\/)/
    )
  })

  it('should retry failed RSC fetches without falling back to MPA navigation', async () => {
    let rscRequestCount = 0

    const browser = await next.browser('/dynamic', {
      beforePageLoad(page) {
        page.route('**/other*', async (route) => {
          if (route.request().url().includes('_rsc=')) {
            rscRequestCount++
            if (rscRequestCount === 1) {
              await route.abort('connectionreset')
              return
            }
          }
          await route.continue()
        })
      },
    })

    await browser.eval('window.__TEST_NO_RELOAD = true')
    await browser.elementByCss('#to-other').click()

    await retry(
      async () => {
        const body = await browser.elementByCss('body')
        expect(await body.text()).toContain('this is other')
      },
      10_000,
      250
    )

    expect(await browser.eval('window.__TEST_NO_RELOAD')).toBe(true)
    // One initial request + one retry attempt.
    expect(rscRequestCount).toBe(2)
  })

  it('should recover after a transient async chunk load failure', async () => {
    let nextDynamicChunk = await getChunkContainingText(
      'this is a lazy loaded async component'
    )
    let chunkRequestCount = 0
    let pageError: Error | undefined

    const browser = await next.browser('/dynamic', {
      beforePageLoad(page) {
        page.route(`**/${nextDynamicChunk}*`, async (route) => {
          chunkRequestCount++
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

    await retry(
      async () => {
        const body = await browser.elementByCss('body')
        expect(await body.text()).toContain(
          'this is a lazy loaded async component'
        )
      },
      10_000,
      250
    )

    // One initial request + one retry attempt.
    expect(chunkRequestCount).toBe(2)
    expect(pageError).toBeUndefined()
  })

  it('should fallback to MPA navigation after a persistent RSC fetch failure', async () => {
    let rscRequestCount = 0

    const browser = await next.browser('/dynamic', {
      beforePageLoad(page) {
        page.route('**/other*', async (route) => {
          if (route.request().url().includes('_rsc=')) {
            rscRequestCount++
            await route.abort('connectionreset')
            return
          }
          await route.continue()
        })
      },
    })

    await browser.eval('window.__TEST_NO_RELOAD = true')
    await browser.elementByCss('#to-other').click()

    await retry(
      async () => {
        expect(await browser.eval('window.location.pathname')).toBe('/other')
        const body = await browser.elementByCss('body')
        expect(await body.text()).toContain('this is other')
      },
      10_000,
      250
    )

    // MPA fallback reloads the page context.
    expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    // One initial request + one retry attempt.
    expect(rscRequestCount).toBe(2)
  })

  it('should recover after a transient pages-router chunk load failure', async () => {
    let pagesDynamicChunk = await getChunkContainingText(
      'this is a pages-router lazy loaded async component'
    )
    let chunkRequestCount = 0
    let pageError: Error | undefined

    const browser = await next.browser('/pages-dynamic', {
      beforePageLoad(page) {
        page.route(`**/${pagesDynamicChunk}*`, async (route) => {
          chunkRequestCount++
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

    await retry(
      async () => {
        const body = await browser.elementByCss('body')
        expect(await body.text()).toContain(
          'this is a pages-router lazy loaded async component'
        )
      },
      10_000,
      250
    )

    // One initial request + one retry attempt.
    expect(chunkRequestCount).toBe(2)
    // Browser/runtime paths differ here: some surface the first transient failure
    // as a page error before retry succeeds, others recover without one.
    if (pageError) {
      expect(pageError.name).toBe('ChunkLoadError')
    }
  })

  it('should report aborted chunks when navigating away', async () => {
    let nextDynamicChunk = await getChunkContainingText(
      'this is a lazy loaded async component'
    )

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
