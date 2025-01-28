import { nextTestSetup } from 'e2e-utils'

describe('dev-overlay - portal-not-affect-parent', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not affect parent display', async () => {
    const browser = await next.browser('/')
    const rect = await browser.eval(
      // https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
      `document.querySelector('#div2').getBoundingClientRect()`
    )
    // Since the <body> has `space-between`, if the shadow root takes up
    // the space, the x of #div2 will be 100 as is the width of #div1.
    // If the shadow root does not take up the space, as the total width of
    // the <body> is 300 and as is a space-between, the #div2 will be placed
    // at the end of the <body> and the x will be 200.

    // Before: <#div1 100> <#div2 100> <nextjs-portal 100>
    // After: <#div1 100> [space-between 100] <#div2 100> <nextjs-portal 0>
    expect(rect.x).toBe(200)
  })
})
