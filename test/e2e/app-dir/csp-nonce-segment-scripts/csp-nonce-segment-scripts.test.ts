import { nextTestSetup } from 'e2e-utils'

describe('csp-nonce-segment-scripts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // The loading and template files import a client component that the page
  // also imports, so their chunk is not already loaded by a layout or by a
  // client reference, and it gets a script tag of its own.
  it('should add the nonce to the script tags of loading and template files', async () => {
    const $ = await next.render$('/with-boundaries')

    const scripts = $('script[src]')
      .toArray()
      .map((element) => ({
        src: $(element).attr('src'),
        nonce: $(element).attr('nonce'),
      }))

    expect(scripts.length).toBeGreaterThan(0)
    expect(scripts.filter((script) => script.nonce !== 'test-nonce')).toEqual(
      []
    )
  })
})
