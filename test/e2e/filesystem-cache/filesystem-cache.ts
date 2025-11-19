import { nextTestSetup, isNextDev } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

describe('persistent-caching', () => {
  process.env.NEXT_PUBLIC_ENV_VAR = 'hello world'
  const { skipped, next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    // We need to use npm here as pnpms symlinks trigger a weird bug (kernel bug?)
    installCommand: 'npm i',
    buildCommand: 'npm exec next build',
    startCommand: isNextDev ? 'npm exec next dev' : 'npm exec next start',
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
      // Turbopack has an idle timeout of 2s
      // Webpack has an idle timeout (after large changes) of 1s
      // and we give time a bit more to allow writing to disk
      await waitFor(3000)
    }
    await next.stop()
  }

  async function start() {
    await next.start()
  }

  it('should filesystem cache loaders', async () => {
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
      expect(await browser.elementByCss('main').text()).toBe(appTimestamp)
      await browser.close()
    }
    {
      const browser = await next.browser('/unchanged')
      expect(await browser.elementByCss('main').text()).toBe(unchangedTimestamp)
      await browser.close()
    }
    {
      const browser = await next.browser('/client')
      expect(await browser.elementByCss('main').text()).toBe(appClientTimestamp)
      await browser.close()
    }
    {
      const browser = await next.browser('/pages')
      expect(await browser.elementByCss('main').text()).toBe(pagesTimestamp)
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

  const POTENTIAL_CHANGES = {
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
  }

  const KEYS = Object.keys(POTENTIAL_CHANGES)
  for (let bitset = 1; bitset < 1 << KEYS.length; bitset++) {
    let combination = []
    for (let i = 0; i < KEYS.length; i++) {
      if (bitset & (1 << i)) {
        combination.push(KEYS[i])
      }
    }
    // Checking only single change and all combined for performance reasons.
    if (combination.length !== 1 && combination.length !== KEYS.length) continue

    it(`should allow to change files while stopped (${combination.join(', ')})`, async () => {
      let fullInvalidation = false
      for (const key of combination) {
        await POTENTIAL_CHANGES[key].checkInitial()
        if (POTENTIAL_CHANGES[key].fullInvalidation) {
          fullInvalidation = true
        }
      }

      let unchangedTimestamp
      if (!fullInvalidation) {
        const browser = await next.browser('/unchanged')
        unchangedTimestamp = await browser.elementByCss('main').text()
        expect(unchangedTimestamp).toMatch(/Timestamp = \d+$/)
        await browser.close()
      }

      async function checkChanged() {
        for (const key of combination) {
          await POTENTIAL_CHANGES[key].checkChanged()
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
      for (const key of combination) {
        const prev = current
        current = () => POTENTIAL_CHANGES[key].withChange(prev)
      }
      await current()

      await start()
      for (const key of combination) {
        await POTENTIAL_CHANGES[key].checkInitial()
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
