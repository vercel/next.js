import { nextTestSetup } from 'e2e-utils'

describe('styled-jsx', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      'styled-jsx': '5.0.0', // styled-jsx on user side
    },
  })

  if (skipped) {
    return
  }

  it('should contain styled-jsx styles during SSR', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/color:.*?red/)
    expect(html).toMatch(/color:.*?cyan/)
  })

  it('should render styles during CSR', async () => {
    const browser = await next.browser('/')
    const color = await browser.eval(
      `getComputedStyle(document.querySelector('button')).color`
    )

    expect(color).toMatch('0, 255, 255')
  })

  it('should render styles inside TypeScript', async () => {
    const browser = await next.browser('/typescript')
    const color = await browser.eval(
      `getComputedStyle(document.querySelector('button')).color`
    )

    expect(color).toMatch('255, 0, 0')
  })
})
