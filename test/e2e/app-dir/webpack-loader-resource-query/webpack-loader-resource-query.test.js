import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('webpack-loader-resource-query', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should pass query to loader', async () => {
    await next.render$('/')

    expect(next.cliOutput).toContain('resource query:  ?test=hi')
  })

  it('should apply loader based on resourceQuery', async () => {
    const $ = await next.render$('/')
    const text = $('#reversed').text()
    expect(text).toBe('dlroW olleH')
  })

  it('should apply loader based on resourceQuery regex', async () => {
    const $ = await next.render$('/')
    const text = $('#upper').text()
    expect(text).toBe('HELLO WORLD')
  })
})
