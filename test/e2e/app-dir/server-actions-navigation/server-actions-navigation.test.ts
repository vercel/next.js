import { nextTestSetup } from 'e2e-utils'

describe('server action resolving after navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('does not commit stale server action state after navigation', async () => {
    const browser = await next.browser('/')

    // Trigger server action + immediate navigation
    await browser.getByRole('button', { name: 'Run server action' }).click()

    // Ensure navigation completed
    await browser.waitForElementByCss('#next-page')

    // Ensure stale server action result was NOT applied
    const result = await browser.eval(() => {
      const el = document.querySelector('#result')
      return el?.textContent ?? null
    })

    expect(result).not.toBe('STALE_RESULT')
  })
})
