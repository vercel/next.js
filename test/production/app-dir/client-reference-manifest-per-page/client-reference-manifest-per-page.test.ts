import { nextTestSetup } from 'e2e-utils'

describe('client-reference-manifest-per-page', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('only includes client references reachable from the page', async () => {
    const manifestA = await next.readFile(
      '.next/server/app/a/page_client-reference-manifest.js'
    )
    const manifestB = await next.readFile(
      '.next/server/app/b/page_client-reference-manifest.js'
    )

    expect(manifestA).toContain('only-on-a')
    expect(manifestA).not.toContain('only-on-b')
    expect(manifestB).toContain('only-on-b')
    expect(manifestB).not.toContain('only-on-a')
  })

  it('renders and hydrates each page', async () => {
    const browserA = await next.browser('/a')
    await browserA.elementByCss('button').click()
    expect(await browserA.elementByCss('button').text()).toBe('only on a 1')

    const browserB = await next.browser('/b')
    await browserB.elementByCss('button').click()
    expect(await browserB.elementByCss('button').text()).toBe('only on b 1')
  })
})
