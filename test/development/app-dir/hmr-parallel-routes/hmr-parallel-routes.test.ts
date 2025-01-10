import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

describe('hmr-parallel-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should update parallel routes via HMR', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#bar').text()).toBe('Bar Page')
    expect(await browser.elementByCss('#foo').text()).toBe('Foo Page')

    await next.patchFile('app/@bar/page.tsx', (content) =>
      content.replace('Bar Page', 'Bar Page Updated')
    )

    await assertNoRedbox(browser)

    expect(await browser.elementByCss('#bar').text()).toBe('Bar Page Updated')

    await next.patchFile('app/@foo/page.tsx', (content) =>
      content.replace('Foo Page', 'Foo Page Updated')
    )

    await assertNoRedbox(browser)

    expect(await browser.elementByCss('#foo').text()).toBe('Foo Page Updated')
  })
})
