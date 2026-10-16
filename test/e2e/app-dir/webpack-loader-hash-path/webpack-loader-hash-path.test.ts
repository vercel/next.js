import { nextTestSetup } from 'e2e-utils'

describe('turbopack-loader-hash-path', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should compile and not truncate the resource path', async () => {
    const $ = await next.render$('/')
    expect($('#message').text()).toBe('Success!')
    // The path should contain the full file path, including the hashtag
    expect($('#path').text()).toContain('#/nested/item.custom.js')
    // The fragment should be completely empty
    expect($('#fragment').text()).toBe('')
  })
})
