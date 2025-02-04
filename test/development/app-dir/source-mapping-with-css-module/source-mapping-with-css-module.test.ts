import { nextTestSetup } from 'e2e-utils'
import { getRedboxSource } from 'next-test-utils'

describe('source-mapping-with-css-module', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('works with css module', async () => {
    const browser = await next.browser('/with-css-module')

    const source = await getRedboxSource(browser)
    expect(source).toContain('app/with-css-module/page.js')
  })

  it('works without css module', async () => {
    const browser = await next.browser('/without-css-module')
    const source = await getRedboxSource(browser)
    expect(source).toContain('app/without-css-module/page.js')
  })
})
