import { nextTestSetup } from 'e2e-utils'

describe('params-encoding-consistency', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Regression test for https://github.com/vercel/next.js/issues/95343
  // `await params` must resolve to the same value in the page component and in
  // `generateMetadata`. Previously the page received the encoded value while
  // `generateMetadata` received the decoded value.
  it('should resolve params consistently in page and generateMetadata', async () => {
    const $ = await next.render$('/products/foo%20bar')

    const pageParam = $('#product-id').text()
    const metadataParam = $('title').text()

    // App Router does not auto-decode dynamic params, so both call sites
    // should observe the encoded segment value.
    expect(pageParam).toBe('foo%20bar')
    expect(metadataParam).toBe('foo%20bar')
    expect(pageParam).toBe(metadataParam)
  })
})
