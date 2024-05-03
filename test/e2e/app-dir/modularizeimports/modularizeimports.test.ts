import { nextTestSetup } from 'e2e-utils'

describe('modularizeImports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@next/mdx': 'canary',
      '@mdx-js/loader': '^2.2.1',
      '@mdx-js/react': '^2.2.1',
    },
  })

  it('should work', async () => {
    const $ = await next.render$('/')
    expect($('#cart-icon').text()).toBe('Cart Icon')
    expect($('#search-icon').text()).toBe('Search Icon')
  })

  it('should work with MDX', async () => {
    const $ = await next.render$('/mdx')
    expect($('#cart-icon').text()).toBe('Cart Icon')
    expect($('#search-icon').text()).toBe('Search Icon')
  })
})
