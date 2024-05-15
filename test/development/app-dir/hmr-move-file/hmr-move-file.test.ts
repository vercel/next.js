import { nextTestSetup } from 'e2e-utils'
import { hasRedbox } from 'next-test-utils'

describe('HMR Move File', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work when moving a component to another directory', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#hello-world-button').text()).toBe(
      'hello world'
    )

    await next.renameFile('app/button.tsx', 'app/button2.tsx')
    await next.patchFile('app/page.tsx', (content) =>
      content.replace('./button', './button2')
    )

    expect(await hasRedbox(browser)).toBe(false)

    expect(await browser.elementByCss('#hello-world-button').text()).toBe(
      'hello world'
    )
  })
})
