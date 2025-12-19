import { nextTestSetup } from 'e2e-utils'

describe('app dir - duplicate layout components', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not duplicate layout elements when navigating to 404', async () => {
    const browser = await next.browser('/solutions/404')

    // Verify counts haven't changed - no duplication
    expect((await browser.elementsByCss('body')).length).toBe(1)
    expect((await browser.elementsByCss('#header')).length).toBe(1)
    expect((await browser.elementsByCss('#footer')).length).toBe(1)
  })
})
