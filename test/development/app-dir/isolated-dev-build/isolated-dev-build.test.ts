import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('isolated-dev-build', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should create dev artifacts in .next/dev/ directory', async () => {
    expect(await next.hasFile('.next/dev')).toBe(true)
    expect(await next.hasFile('.next/server')).toBe(false)
  })

  it('should work with HMR', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    await next.patchFile('app/page.tsx', (content) => {
      return content.replace('hello world', 'hello updated world')
    })

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('hello updated world')
    })
  })
})
