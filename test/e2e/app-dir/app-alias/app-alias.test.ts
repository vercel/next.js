import { nextTestSetup } from 'e2e-utils'

describe('app-dir alias', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should handle typescript paths alias correctly', async () => {
    const html = await next.render('/button')
    expect(html).toContain('click</button>')
  })

  it('should resolve css imports from outside with src folder presented', async () => {
    const browser = await next.browser('/button')
    const fontSize = await browser
      .elementByCss('button')
      .getComputedCss('font-size')
    expect(fontSize).toBe('50px')
  })
})
