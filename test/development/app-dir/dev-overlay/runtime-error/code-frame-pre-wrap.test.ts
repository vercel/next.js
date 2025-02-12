import { nextTestSetup } from 'e2e-utils'

describe('dev-overlay - runtime-error - code-frame-pre-wrap', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have white-space: pre-wrap for code-frame', async () => {
    const browser = await next.browser('/')
    const computedStyle = await browser.eval(
      (element) => {
        return window.getComputedStyle(element).whiteSpace
      },
      await browser.elementByCss('[data-nextjs-codeframe] pre')
    )
    expect(computedStyle).toBe('pre-wrap')
  })
})
