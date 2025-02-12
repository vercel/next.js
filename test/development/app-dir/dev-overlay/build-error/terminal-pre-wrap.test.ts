import { nextTestSetup } from 'e2e-utils'

describe('dev-overlay - build-error - terminal-pre-wrap', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have white-space: pre-wrap for terminal', async () => {
    const browser = await next.browser('/')
    const computedStyle = await browser.eval(
      (element) => {
        return window.getComputedStyle(element).whiteSpace
      },
      // TODO: use separate data attribute for terminal
      await browser.elementByCss('[data-nextjs-codeframe] pre')
    )
    expect(computedStyle).toBe('pre-wrap')
  })
})
