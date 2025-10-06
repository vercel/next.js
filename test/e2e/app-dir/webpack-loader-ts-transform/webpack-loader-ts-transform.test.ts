import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-ts-transform', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    // This test is skipped because it's only expected to run in turbopack, which isn't enabled for builds
    skipDeployment: true,
  })

  if (!isTurbopack || skipped) {
    it('should only run the test in turbopack', () => {})
    return
  }

  it('should accept Typescript returned from Webpack loaders', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('something')
  })
})
