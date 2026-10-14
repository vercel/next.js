import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('rsc-result-shell-recovery', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('recovers the shell while completing the original hydration payload', async () => {
    const res = await next.fetch('/')
    const html = await res.text()
    expect(res.status).toBe(500)
    expect(html).toContain('__next_error__')
    expect(html).toContain('original hydration future')
    // Deployment CLI output contains build logs, not runtime errors.
    if (!isNextDeploy) {
      expect(next.cliOutput).toContain('original Result shell failure')
    }

    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementById('future-marker').text()).toBe(
        'original hydration future'
      )
    })
  })
})
