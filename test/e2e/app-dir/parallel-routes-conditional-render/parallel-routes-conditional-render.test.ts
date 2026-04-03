import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-conditional-render', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Regression test for https://github.com/vercel/next.js/issues/53292
  // Both parallel route page.tsx files execute on the server even when
  // the layout conditionally renders only one slot.
  it('should only execute the rendered parallel route slot', async () => {
    const browser = await next.browser('/')

    // With isLoggedIn = false, the layout renders {auth} not {children}
    await retry(async () => {
      const text = await browser.elementByCss('p').text()
      expect(text).toBe('Auth Page')
    })

    // The home page should NOT be visible
    const bodyText = await browser.elementByCss('body').text()
    expect(bodyText).not.toContain('Home Page')

    // The key assertion: only the rendered slot should have executed on the server.
    // Due to #53292, both slots execute regardless of which is rendered.
    const output = next.cliOutput
    expect(output).toContain('>>> AUTH PAGE EXECUTED <<<')
    expect(output).not.toContain('>>> HOME PAGE EXECUTED <<<')
  })
})
