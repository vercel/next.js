import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('actions-edge-mixed', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('does not compile Node server actions for the Edge runtime', async () => {
    const browser = await next.browser('/node')
    await browser.elementById('run-action').click()

    await retry(async () => {
      expect(await browser.elementById('value').text()).toBe('node action')
    })

    const edgeResponse = await next.fetch('/edge')
    expect(await edgeResponse.text()).toContain('edge page')

    expect(next.cliOutput).not.toContain('app/node/actions-lib.ts')
  })

  if (isNextDev && isTurbopack) {
    // Only relevant for Turbopack, and the other bundlers don't output that edge error.
    it('should only compile for edge when page runtime is set', async () => {
      await next.browser('/client-error')
      expect(next.cliOutput).not.toContain(
        'which is not supported in the Edge Runtime.'
      )
      const output = next.getCliOutputFromHere()
      await next.patchFile(
        'app/client-error/page.js',
        (origContent) => origContent + `\nexport const runtime = "edge";`,
        async () => {
          await retry(async () => {
            await next.browser('/client-error')
            expect(output()).toContain(
              'which is not supported in the Edge Runtime.'
            )
          })
        }
      )
    })
  }
})
