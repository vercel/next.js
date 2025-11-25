import { nextTestSetup, isNextDev } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

process.env.NEXT_PUBLIC_ENV_VAR = 'hello world'
// Make it easier to run in development, test directories are cleared between runs already so this is safe.
process.env.TURBO_ENGINE_IGNORE_DIRTY = '1'
// decrease the idle timeout to make the test more reliable
process.env.TURBO_ENGINE_SNAPSHOT_IDLE_TIMEOUT_MILLIS = '1000'

for (const cacheEnabled of [false, true]) {
  describe(`filesystem-caching with cache ${cacheEnabled ? 'enabled' : 'disabled'}`, () => {
    const { skipped, next, isTurbopack } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      packageJson: {
        scripts: {
          build: `ENABLE_CACHING=${cacheEnabled ? '1' : ''} next build`,
          dev: `ENABLE_CACHING=${cacheEnabled ? '1' : ''} next dev`,
          start: 'next start',
        },
      },
      // We need to use npm here as pnpms symlinks trigger a weird bug (kernel bug?)
      installCommand: 'npm i',
      // Next is always started with caching, but this can disable it for the followup restarts
      buildCommand: `npm run build`,
      startCommand: isNextDev ? 'npm run dev' : 'npm run start',
    })

    if (skipped) {
      return
    }

    beforeAll(() => {
      // We can skip the dev watch delay since this is not an HMR test
      ;(next as any).handleDevWatchDelayBeforeChange = () => {}
      ;(next as any).handleDevWatchDelayAfterChange = () => {}
    })

    async function restartCycle() {
      await stop()
      await start()
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

    it('should cache or not cache loaders', async () => {
      let appTimestamp, unchangedTimestamp, appClientTimestamp, pagesTimestamp
      {
        const browser = await next.browser('/')
        appTimestamp = await browser.elementByCss('main').text()
        expect(appTimestamp).toMatch(/Timestamp = \d+$/)
        await browser.close()
      }
      {
        const browser = await next.browser('/unchanged')
        unchangedTimestamp = await browser.elementByCss('main').text()
        expect(unchangedTimestamp).toMatch(/Timestamp = \d+$/)
        await browser.close()
      }
      {
        const browser = await next.browser('/client')
        appClientTimestamp = await browser.elementByCss('main').text()
        expect(appClientTimestamp).toMatch(/Timestamp = \d+$/)
        await browser.close()
      }
      {
        const browser = await next.browser('/pages')
        pagesTimestamp = await browser.elementByCss('main').text()
        expect(pagesTimestamp).toMatch(/Timestamp = \d+$/)
        await browser.close()
      }
      await restartCycle()

      {
        const browser = await next.browser('/')
        const newTimestamp = await browser.elementByCss('main').text()
        expect(newTimestamp).toMatch(/Timestamp = \d+$/)
        if (cacheEnabled) {
          expect(newTimestamp).toBe(appTimestamp)
        } else {
          expect(newTimestamp).not.toBe(appTimestamp)
        }
        await browser.close()
      }
      {
        const browser = await next.browser('/unchanged')
        const newTimestamp = await browser.elementByCss('main').text()
        expect(newTimestamp).toMatch(/Timestamp = \d+$/)
        if (cacheEnabled) {
          expect(newTimestamp).toBe(unchangedTimestamp)
        } else {
          expect(newTimestamp).not.toBe(unchangedTimestamp)
        }
        await browser.close()
      }
      {
        const browser = await next.browser('/client')
        const newTimestamp = await browser.elementByCss('main').text()
        expect(newTimestamp).toMatch(/Timestamp = \d+$/)
        if (cacheEnabled) {
          expect(newTimestamp).toBe(appClientTimestamp)
        } else {
          expect(newTimestamp).not.toBe(appClientTimestamp)
        }
        await browser.close()
      }
      {
        const browser = await next.browser('/pages')
        const newTimestamp = await browser.elementByCss('main').text()
        expect(newTimestamp).toMatch(/Timestamp = \d+$/)
        if (cacheEnabled) {
          expect(newTimestamp).toBe(pagesTimestamp)
        } else {
          expect(newTimestamp).not.toBe(pagesTimestamp)
        }
        await browser.close()
      }
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

    interface Change {
      checkInitial(): Promise<void>
      withChange(previous: () => Promise<void>): Promise<void>
      checkChanged(): Promise<void>
      fullInvalidation?: boolean
    }
    const POTENTIAL_CHANGES: Record<string, Change> = {
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
      },
      // TODO fix this case with Turbopack
      ...(isTurbopack
        ? {}
        : {
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
          }),
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
    } as const

    // Checking only single change and all combined for performance reasons.
    const combinations = Object.entries(POTENTIAL_CHANGES).map(([k, v]) => [
      k,
      [v],
    ]) as Array<[string, Array<Change>]>
    combinations.push([
      Object.keys(POTENTIAL_CHANGES).join(', '),
      Object.values(POTENTIAL_CHANGES),
    ])

    for (const [name, changes] of combinations) {
      it(`should allow to change files while stopped (${name})`, async () => {
        let fullInvalidation = !cacheEnabled
        for (const change of changes) {
          await change.checkInitial()
          if (change.fullInvalidation) {
            fullInvalidation = true
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
      }, 200000)
    }
  })
}
