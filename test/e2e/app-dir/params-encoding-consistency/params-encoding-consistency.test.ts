import { nextTestSetup } from 'e2e-utils'

describe('params-encoding-consistency', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Regression test for https://github.com/vercel/next.js/issues/95343
  // `await params` must decode the same way in the page component and in
  // `generateMetadata`. Previously the page received the raw (encoded) value
  // while `generateMetadata` received the decoded value.
  it('should decode params consistently in page and generateMetadata', async () => {
    const $ = await next.render$('/products/foo%20bar')

    const pageParam = $('#product-id').text()
    const metadataParam = $('title').text()

    expect(pageParam).toBe('foo bar')
    expect(metadataParam).toBe('foo bar')
    expect(pageParam).toBe(metadataParam)
  })
})
