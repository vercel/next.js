import { nextTestSetup } from 'e2e-utils'

describe('metadata-svg-icon', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have sizes=any for .svg icon', async () => {
    const $ = await next.render$('/')
    const icon = $('link[rel="icon"][type="image/svg+xml"]')
    expect(icon.attr('sizes')).toBe('any')
  })
})
