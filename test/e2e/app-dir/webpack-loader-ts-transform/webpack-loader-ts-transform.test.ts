import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-ts-transform', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should accept Typescript returned from Webpack loaders', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('something')
  })
})
