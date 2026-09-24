import { nextTestSetup } from 'e2e-utils'

// Regression test for https://github.com/vercel/next.js/issues/95517
// A single-element `pageExtensions` array (e.g. `['tsx']`) failed to
// resolve any app dir route when building with webpack, because the
// loader options were serialized with `querystring.stringify`, which
// collapses a one-element array into a bare string.
describe('page-extensions-single-value-app', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should resolve app dir routes when pageExtensions has a single value', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
