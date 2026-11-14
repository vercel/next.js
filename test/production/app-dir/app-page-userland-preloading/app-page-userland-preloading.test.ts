import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const cacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'

// Verify self-hosted startup evaluation separately from build and request logs.
describe.each([undefined, true, false])(
  'App Page preloadEntriesOnStart: %s',
  (preloadEntriesOnStart) => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      nextConfig: {
        experimental: {
          ...(preloadEntriesOnStart === undefined
            ? {}
            : { preloadEntriesOnStart }),
        },
      },
    })

    beforeAll(async () => {
      const { exitCode } = await next.build()
      if (exitCode !== 0) {
        throw new Error(`next build failed with exit code ${exitCode}`)
      }
      next.env.PAGE_PRELOAD_REJECT = '1'
      await next.start({ skipBuild: true })
    })

    it('loads page tree modules but does not render before the first request', async () => {
      if (preloadEntriesOnStart === false) {
        const response = await next.fetch('/api/sentinel')
        expect(response.status).toBe(200)
        expect(next.cliOutput).not.toContain('page-preload:layout-loaded')
        expect(next.cliOutput).not.toContain('page-preload:page-loaded')
        expect(next.cliOutput).not.toContain('page-preload:slot-loaded')
        expect(next.cliOutput).not.toContain('page-preload:failing-loaded')
      } else {
        await retry(async () => {
          for (const name of [
            'layout',
            'page',
            'slot',
            'template',
            'loading',
            'not-found',
            'failing',
            'health',
          ]) {
            expect(next.cliOutput).toContain(`page-preload:${name}-loaded`)
          }
          expect(next.cliOutput).toContain('page-preload:bound-action-ready')
        })
      }
      expect(next.cliOutput).not.toContain('page-preload:rendered')
      expect(next.cliOutput).not.toMatch(
        /unhandledRejection|manifests singleton was not initialized|Missing.*manifest/i
      )
    })

    it('serves the page without reevaluating modules', async () => {
      for (let i = 0; i < 2; i++) {
        const response = await next.fetch('/')
        expect(response.status).toBe(200)
        const html = await response.text()
        expect(html).toContain('bound value')
        expect(html).toContain('slot content')
      }
      for (const name of ['page', 'layout', 'slot']) {
        expect(
          next.cliOutput.split(`page-preload:${name}-loaded`).length - 1
        ).toBe(1)
      }
    })

    it('contains a failing page without breaking other entries', async () => {
      for (let i = 0; i < 2; i++) {
        const response = await next.fetch('/failing')
        // Cache Components may send the partial shell before this module fails.
        expect(response.status).toBe(cacheComponents ? 200 : 500)
        await response.text().catch((error) => {
          if (!cacheComponents) throw error
          // A failed streamed response can close before its body completes.
          expect(error.message).toMatch(
            /aborted|terminated|premature close|stream.*close/i
          )
        })
        await retry(async () => {
          expect(next.cliOutput).toContain('page-preload:expected-failure')
        })
      }
      expect(
        next.cliOutput.split('page-preload:failing-loaded').length - 1
      ).toBe(1)
      const response = await next.fetch('/z-health')
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('healthy page')
      expect(next.cliOutput).not.toMatch(/unhandledRejection/i)
    })
  }
)
