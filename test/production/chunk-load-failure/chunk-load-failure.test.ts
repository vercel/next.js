import { nextTestSetup } from 'e2e-utils'
import path from 'path'
import fs from 'fs'
import { listClientChunks, retry } from 'next-test-utils'

describe('chunk-load-failure', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getNextDynamicChunks() {
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
    expect(nextDynamicChunks.length).toBeGreaterThan(0)

    return nextDynamicChunks.map((chunk) => chunk.replace(/\\/g, '/'))
  }

  function getMatchingChunk(chunkUrl: string, chunks: string[]) {
    return chunks.find((chunk) => chunkUrl.includes(chunk))
  }

  it('should report async chunk load failures', async () => {
    let nextDynamicChunks = await getNextDynamicChunks()

    let pageError: Error | undefined
    let failedChunk: string | undefined
    const browser = await next.browser('/dynamic', {
      beforePageLoad(page) {
        page.route('**/_next/static/**/*.js*', async (route) => {
          const matchingChunk = getMatchingChunk(
            route.request().url(),
            nextDynamicChunks
          )
          if (!matchingChunk) {
            await route.continue()
            return
          }
          failedChunk = matchingChunk
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
    expect(failedChunk).toBeDefined()
    if (process.env.IS_TURBOPACK_TEST) {
      expect(pageError.message).toStartWith(
        'Failed to load chunk /_next/' + failedChunk
      )
    } else {
      expect(pageError.message).toMatch(/^Loading chunk \S+ failed./)
      expect(pageError.message).toContain('/_next/' + failedChunk)
    }
  })

  it('should allow async chunk loads after a transient failure', async () => {
    let nextDynamicChunks = await getNextDynamicChunks()
    let failedChunk: string | undefined
    let failedChunkRequests = 0

    const browser = await next.browser('/retry', {
      beforePageLoad(page) {
        page.route('**/_next/static/**/*.js*', async (route) => {
          const matchingChunk = getMatchingChunk(
            route.request().url(),
            nextDynamicChunks
          )
          if (!matchingChunk) {
            await route.continue()
            return
          }

          if (failedChunk == null) {
            failedChunk = matchingChunk
            failedChunkRequests++
            await route.abort('connectionreset')
            return
          }

          if (matchingChunk === failedChunk) {
            failedChunkRequests++
          }
          await route.continue()
        })
      },
    })

    await browser.elementByCss('#load').click()
    await retry(async () => {
      expect(await browser.elementByCss('#status').text()).toContain(
        'ChunkLoadError'
      )
    })

    await browser.elementByCss('#load').click()
    await retry(async () => {
      expect(await browser.elementByCss('#status').text()).toBe(
        'this is a lazy loaded async component'
      )
    })
    expect(failedChunkRequests).toBe(2)
  })

  it('should report aborted chunks when navigating away', async () => {
    let nextDynamicChunks = await getNextDynamicChunks()

    let resolve
    try {
      const browser = await next.browser('/dynamic', {
        beforePageLoad(page) {
          page.route('**/_next/static/**/*.js*', async (route) => {
            const matchingChunk = getMatchingChunk(
              route.request().url(),
              nextDynamicChunks
            )
            if (!matchingChunk) {
              await route.continue()
              return
            }
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
