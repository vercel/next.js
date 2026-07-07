import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

// Eviction requires the dev server (HMR) and persistent caching (Turbopack).
// Skip entirely in prod/start mode.
;(isNextDev ? describe : describe.skip)('evict-after-snapshot', () => {
  const envVars = [
    'ENABLE_CACHING=1',
    'TURBO_ENGINE_IGNORE_DIRTY=1',
    'TURBO_ENGINE_SNAPSHOT_IDLE_TIMEOUT_MILLIS=1000',
    'ENABLE_EVICTION=1',
  ].join(' ')

  const { skipped, next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    packageJson: {
      scripts: {
        dev: `${envVars} next dev`,
      },
    },
    installCommand: 'npm i',
    startCommand: 'npm run dev',
  })

  if (skipped) {
    return
  }

  async function waitForSnapshotAndEviction() {
    // The idle timeout is 1s, give extra time for snapshot + eviction to complete
    await waitFor(5000)
  }

  // Turbopack-only: eviction requires persistent caching
  ;(process.env.IS_TURBOPACK_TEST ? it : it.skip)(
    'should serve correct content after eviction and HMR',
    async () => {
      const browser = await next.browser('/')
      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe('hello world')
      })

      let currentContent = 'hello world'
      for (let cycle = 1; cycle <= 3; cycle++) {
        await waitForSnapshotAndEviction()

        const prevContent = currentContent
        const nextContent = `cycle ${cycle}`
        await next.patchFile('app/page.tsx', (content) =>
          content.replace(prevContent, nextContent)
        )
        currentContent = nextContent

        const expected = currentContent
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe(expected)
        }, 10000)
      }

      await browser.close()
    },
    90000
  )
  ;(process.env.IS_TURBOPACK_TEST ? it : it.skip)(
    'should handle client component HMR after eviction',
    async () => {
      const browser = await next.browser('/client')
      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe('hello world')
      })

      await waitForSnapshotAndEviction()

      await next.patchFile(
        'app/client/page.tsx',
        (content) => content.replace('hello world', 'hello eviction'),
        async () => {
          await retry(async () => {
            expect(await browser.elementByCss('p').text()).toBe(
              'hello eviction'
            )
          }, 10000)
        }
      )

      await browser.close()
    },
    90000
  )
})
