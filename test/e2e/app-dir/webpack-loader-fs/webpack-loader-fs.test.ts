import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-fs', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  it('should allow reading the input FS', async () => {
    const $ = await next.render$('/')
    expect($('#test').text()).toBe(
      "Buffer read: 18, string read: 'this is some data', binary read: 6765"
    )
  })
})
