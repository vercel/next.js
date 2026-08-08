import { nextTestSetup } from 'e2e-utils'

describe('turbopack-loader-content-type', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

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
