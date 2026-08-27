import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-ts-transform', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
    // This test is skipped because it's only expected to run in turbopack, which isn't enabled for builds
    skipDeployment: true,
  })

  if (skipped) return

  it('should accept Typescript returned from Webpack loaders', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('something')
  })
})
