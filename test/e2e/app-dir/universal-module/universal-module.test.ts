import { nextTestSetup } from 'e2e-utils'
import packageJson from './package.json'

describe('universal-module', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson,
  })

  it('resolves #universal to the SERVER module in server components and the CLIENT module in client components', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementById('server-direct').text()).toBe(
      'direct: value from the SERVER module'
    )
    expect(await browser.elementById('server-shared').text()).toBe(
      'via shared: value from the SERVER module'
    )
    expect(await browser.elementById('client-direct').text()).toBe(
      'direct: value from the CLIENT module'
    )
    expect(await browser.elementById('client-shared').text()).toBe(
      'via shared: value from the CLIENT module'
    )
  })
})
