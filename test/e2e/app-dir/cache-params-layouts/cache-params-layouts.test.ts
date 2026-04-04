import { nextTestSetup } from 'e2e-utils'

describe('app dir - cache params via React.cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should access params via React.cache helper in a child component', async () => {
    const $ = await next.render$('/vercel/next.js')
    expect($('#repo-info-org').text()).toBe('vercel')
    expect($('#repo-info-repo').text()).toBe('next.js')
  })

  it('should access params from a deeper nested page', async () => {
    const $ = await next.render$('/vercel/next.js/settings')
    expect($('#settings-info-org').text()).toBe('vercel')
    expect($('#settings-info-repo').text()).toBe('next.js')
  })

  it('should work with different param values', async () => {
    const $ = await next.render$('/facebook/react')
    expect($('#repo-info-org').text()).toBe('facebook')
    expect($('#repo-info-repo').text()).toBe('react')
  })
})
