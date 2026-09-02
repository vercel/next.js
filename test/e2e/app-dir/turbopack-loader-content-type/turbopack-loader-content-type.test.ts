import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('turbopack-loader-content-type', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should apply loader based on contentType glob pattern', async () => {
    const $ = await next.render$('/')
    const text = $('#text').text()
    expect(text).toBe('TEXT:Hello World')
  })

  it('should apply loader based on contentType for text/javascript', async () => {
    const $ = await next.render$('/')
    const text = $('#js').text()
    expect(text).toBe('Hello from loader')
  })

  it('should apply loader based on contentType regex', async () => {
    const $ = await next.render$('/')
    const text = $('#image').text()
    expect(text).toMatch(/^IMAGE:\d+ bytes$/)
  })
})
