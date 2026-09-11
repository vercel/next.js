import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const forwardedV2 = `
export const value = 'forwarded-v2'
export const replacement = 'replacement-v2'
`

const namespaceV2 = `
export const member = 'namespace-v2'
export const replacement = 'namespace-replacement-v2'
`

describe('Turbopack re-export HMR', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('updates forwarded exports and namespace members without stale values', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementByCss('#forwarded').text()).toBe('forwarded-v1')
    expect(await browser.elementByCss('#namespace').text()).toBe('namespace-v1')

    await next.patchFile('lib/source.js', forwardedV2)
    await retry(async () => {
      expect(await browser.elementByCss('#forwarded').text()).toBe(
        'forwarded-v2'
      )
    })

    await next.patchFile('lib/namespace-source.js', namespaceV2)
    await retry(async () => {
      expect(await browser.elementByCss('#namespace').text()).toBe(
        'namespace-v2'
      )
    })

    expect(await browser.elementByCss('#forwarded').text()).not.toContain(
      'stale'
    )
    expect(await browser.elementByCss('#namespace').text()).not.toContain(
      'stale'
    )
  })
})
