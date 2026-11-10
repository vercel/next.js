import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// With `disableOptimizedLoading` the chunk scripts are `async`, so they can
// execute in any order. The page entry must not rely on `/_app`'s chunks having
// executed first, even though modules already in `/_app` aren't repeated in the
// page's chunks.
describe.each([false, true])(
  'pages-app-chunk-async-loading (turbopackSharedRuntime: %s)',
  (turbopackSharedRuntime) => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        experimental: {
          disableOptimizedLoading: true,
          turbopackSharedRuntime,
        },
      },
    })

    it('hydrates when the /_app chunks execute after the page chunks', async () => {
      const buildManifest = await next.readJSON('.next/build-manifest.json')
      const jsFiles = (page: string): string[] =>
        buildManifest.pages[page].filter((file: string) => file.endsWith('.js'))
      const pageFiles = jsFiles('/')
      const appFiles = jsFiles('/_app')
      const pageOnlyFiles = pageFiles.filter((file) => !appFiles.includes(file))
      const appOnlyFiles = appFiles.filter((file) => !pageFiles.includes(file))
      expect(pageOnlyFiles).not.toBeEmpty()
      expect(appOnlyFiles).not.toBeEmpty()

      // Hold the `/_app`-only chunks until all page-only chunks have executed.
      const executedPageFiles = new Set<string>()
      let releaseAppFiles!: () => void
      const appFilesReleased = new Promise<void>((resolve) => {
        releaseAppFiles = resolve
      })
      const heldRequests = new Set<string>()
      const pageErrors: string[] = []
      const findFile = (files: string[], url: string) => {
        const { pathname } = new URL(url)
        return files.find((file) => pathname.endsWith(`/${file}`))
      }

      const browser = await next.browser('/', {
        async beforePageLoad(page) {
          page.on('pageerror', (error) => pageErrors.push(error.message))
          await page.exposeFunction('__pageChunkExecuted', (file: string) => {
            executedPageFiles.add(file)
            if (executedPageFiles.size === pageOnlyFiles.length) {
              releaseAppFiles()
            }
          })
          await page.route('**/_next/**/*.js*', async (route) => {
            const url = route.request().url()
            const appFile = findFile(appOnlyFiles, url)
            if (appFile) {
              heldRequests.add(appFile)
              await appFilesReleased
              await route.continue()
              return
            }
            const pageFile = findFile(pageOnlyFiles, url)
            if (pageFile) {
              const response = await route.fetch()
              await route.fulfill({
                response,
                body: `${await response.text()}\n;window.__pageChunkExecuted(${JSON.stringify(pageFile)});`,
              })
              return
            }
            await route.continue()
          })
        },
      })

      await retry(async () => {
        expect(pageErrors).toEqual([])
        expect(await browser.eval('window.__NEXT_HYDRATED')).toBe(true)
      })
      await browser.elementByCss('#increment').click()
      await retry(async () => {
        expect(await browser.elementByCss('#increment').text()).toBe('count: 1')
      })
      expect(await browser.elementByCss('#app').text()).toBe('shared from app')
      expect(await browser.elementByCss('#shared').text()).toBe(
        'shared from page'
      )
      expect([...executedPageFiles].sort()).toEqual([...pageOnlyFiles].sort())
      expect([...heldRequests].sort()).toEqual([...appOnlyFiles].sort())
      expect(pageErrors).toEqual([])
    })
  }
)
