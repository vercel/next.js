import { readdir } from 'node:fs/promises'
import { nextTestSetup } from 'e2e-utils'

describe('use-cache-og-image-top-level-await', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // The gates are inert in a deployment build (there's no way to interact
    // with it), and without them nothing distinguishes broken from fixed
    // behavior.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextStart) {
    it('should prerender a page whose opengraph image uses a top-level await', async () => {
      let buildSettled = false
      const buildPromise = next
        .build({ env: { NEXT_TEST_MODULE_GATES: '1' } })
        .finally(() => {
          buildSettled = true
        })

      // Open each gate only after its module evaluation has been waiting for
      // a while, so that all other work of the build has settled by then. In
      // a correct build, the prerender waits for the pending module
      // evaluation, no matter how long the gate stays closed. In a broken
      // build, the prerender concludes without the module evaluation ever
      // finishing, and fails on its own.
      const firstSeen = new Map<string, number>()
      while (!buildSettled) {
        for (const file of await readdir(next.testDir)) {
          const gate = file.match(/^(.+)\.gate-waiting$/)?.[1]
          if (gate && !firstSeen.has(gate)) {
            firstSeen.set(gate, Date.now())
          }
        }
        for (const [gate, seenAt] of firstSeen) {
          if (Date.now() - seenAt > 2000) {
            firstSeen.delete(gate)
            await next.patchFile(`${gate}.gate-open`, '')
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }

      const { exitCode, cliOutput } = await buildPromise

      expect(cliOutput).not.toContain(
        'Unexpected cache miss after cache warming phase'
      )
      expect(cliOutput).not.toContain(
        'Next.js encountered uncached or runtime data in `generateMetadata()`'
      )
      expect(exitCode).toBe(0)
    })
  } else {
    beforeAll(async () => {
      await next.start()
    })

    it('should render a page whose opengraph image uses a top-level await', async () => {
      const $ = await next.render$('/first-post')
      expect($('article').text()).toBe('First Post')

      const res = await next.fetch('/first-post/opengraph-image')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
    })
  }
})
