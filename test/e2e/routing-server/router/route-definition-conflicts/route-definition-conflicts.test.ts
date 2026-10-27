import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// R01/R20: route-handlers.mdx disallows page and route at the same segment.
// This companion mutates a local fixture and inspects build/compile diagnostics.
// @force-gate !deploy
describe('documented route definition conflicts', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('[R01/R20] rejects a page and Route Handler at the same URL', async () => {
    // Prove the page is valid before introducing the competing definition.
    await next.start()
    const control = await next.fetch('/')
    expect(control.status).toBe(200)
    expect(await control.text()).toContain('Page destination')
    if (!isNextDev) await next.stop()

    await next.patchFile(
      'app/route.ts',
      await next.readFile('route-handler.ts')
    )

    // The public constraint does not prescribe exact compiler wording.
    const conflict = /conflict[^\n]*(?:page|route)/i
    if (isNextDev) {
      await retry(async () => {
        const response = await next.fetch('/')
        expect(response.status).toBeGreaterThanOrEqual(400)
        expect(await response.text()).toMatch(conflict)
      })
    } else {
      await expect(next.start()).rejects.toThrow()
    }
    await retry(() => {
      expect(next.cliOutput).toMatch(conflict)
      expect(next.cliOutput).toMatch(/page/i)
      expect(next.cliOutput).toMatch(/route/i)
    })
  })
})
