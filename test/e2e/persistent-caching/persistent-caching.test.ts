import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

describe('persistent-caching', () => {
  process.env.NEXT_PUBLIC_ENV_VAR = 'hello world'
  const { skipped, next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  beforeAll(() => {
    // We can skip the dev watch delay since this is not an HMR test
    ;(next as any).handleDevWatchDelayBeforeChange = () => {}
    ;(next as any).handleDevWatchDelayAfterChange = () => {}
  })

  if (skipped) {
    return
  }

  async function restartCycle() {
    await stop()
    await start()
  }

  async function stop() {
    if (isNextDev) {
      // Give Persistent Cache time to write to disk
      await waitFor(isTurbopack ? 2000 : 10000)
    }
    await next.stop()
  }

  async function start() {
    await next.start()
  }

  it('should persistent cache loaders', async () => {
    let appTimestamp, appClientTimestamp, pagesTimestamp
    {
      const browser = await next.browser('/')
      appTimestamp = await browser.elementByCss('main').text()
      expect(appTimestamp).toMatch(/Timestamp = \d+/)
      await browser.close()
    }
    {
      const browser = await next.browser('/client')
      appClientTimestamp = await browser.elementByCss('main').text()
      expect(appClientTimestamp).toMatch(/Timestamp = \d+/)
      await browser.close()
    }
    {
      const browser = await next.browser('/pages')
      pagesTimestamp = await browser.elementByCss('main').text()
      expect(pagesTimestamp).toMatch(/Timestamp = \d+/)
      await browser.close()
    }
    await restartCycle()

    {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('main').text()).toBe(appTimestamp)
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
          return content.replace('hello world', 'hello persistent caching')
        },
        inner
      )
    }
  }

  /* eslint-disable jest/no-standalone-expect */
  const POTENTIAL_CHANGES = {
    'RSC change': {
      checkInitial: makeTextCheck('/', 'hello world'),
      withChange: makeFileEdit('app/page.tsx'),
      checkChanged: makeTextCheck('/', 'hello persistent caching'),
    },
    'RCC change': {
      checkInitial: makeTextCheck('/client', 'hello world'),
      withChange: makeFileEdit('app/client/page.tsx'),
      checkChanged: makeTextCheck('/client', 'hello persistent caching'),
    },
    'Pages change': {
      checkInitial: makeTextCheck('/pages', 'hello world'),
      withChange: makeFileEdit('pages/pages.tsx'),
      checkChanged: makeTextCheck('/pages', 'hello persistent caching'),
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
    'next config change': {
      async checkInitial() {
        await textCheck('/next-config', 'hello world')
        await textCheck('/next-config/client', 'hello world')
      },
      withChange: makeFileEdit('next.config.js'),
      async checkChanged() {
        await textCheck('/next-config', 'hello persistent caching')
        await textCheck('/next-config/client', 'hello persistent caching')
      },
    },
    'env var change': {
      async checkInitial() {
        await textCheck('/env', 'hello world')
        await textCheck('/env/client', 'hello world')
      },
      async withChange(inner) {
        process.env.NEXT_PUBLIC_ENV_VAR = 'hello persistent caching'
        try {
          await inner()
        } finally {
          process.env.NEXT_PUBLIC_ENV_VAR = 'hello world'
        }
      },
      async checkChanged() {
        await textCheck('/env', 'hello persistent caching')
        await textCheck('/env/client', 'hello persistent caching')
      },
    },
  }
  /* eslint-enable jest/no-standalone-expect */

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
      for (const key of combination) {
        await POTENTIAL_CHANGES[key].checkInitial()
      }

      async function checkChanged() {
        for (const key of combination) {
          await POTENTIAL_CHANGES[key].checkChanged()
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
    })
  }
})
