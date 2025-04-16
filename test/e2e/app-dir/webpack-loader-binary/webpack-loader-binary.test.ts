import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-ts-transform', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should allow passing binary assets to and from a Webpack loader', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('Got a buffer of 18 bytes')
  })
})
