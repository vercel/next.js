import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-resolve', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // This test is skipped because it's only expected to run in turbopack, which isn't enabled for builds
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should support resolving absolute path via loader getResolve', async () => {
    const $ = await next.render$('/')
    expect($('#absolute').text()).toBe('abc')
    expect($('#relative').text()).toBe('xyz')
  })
})
