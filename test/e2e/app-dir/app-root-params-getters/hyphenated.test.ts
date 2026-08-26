import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

// Root params whose names are not valid JS identifiers (e.g. `lang-country`)
// are exported from 'next/root-params' via string module export names.
describe('app-root-param-getters - hyphenated', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'hyphenated'),
  })

  it('should allow reading root params whose names are not valid identifiers', async () => {
    const $ = await next.render$('/en-us')
    expect($('p').text()).toBe(
      `hello world ${JSON.stringify({ 'lang-country': 'en-us' })}`
    )
  })

  it('should render the root param in the layout', async () => {
    const $ = await next.render$('/en-us')
    expect($('html').attr('lang')).toBe('en-us')
  })
})
