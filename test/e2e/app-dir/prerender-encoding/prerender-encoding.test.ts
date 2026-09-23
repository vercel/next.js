import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

describe('prerender-encoding', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should respond with the prerendered page correctly', async () => {
    const $ = await next.render$('/sticks%20%26%20stones')
    expect($('div').text()).toBe('params.id is sticks%20%26%20stones')
  })

  it('should serve an exact closed catch-all path after decoding for manifest lookup', async () => {
    const response = await next.fetch(
      '/closed/docs/space%20here/with%2Fslash/100%25'
    )
    expect(response.status).toBe(200)
    const $ = load(await response.text())
    expect($('div').text()).toBe(
      'params.slug is docs/space%20here/with%2Fslash/100%25'
    )
  })

  it('should serve an open catch-all fallback after decoding for manifest lookup', async () => {
    const pathname = '/open/docs/space%20here/with%2Fslash/fallback%25'
    for (let i = 0; i < 2; i++) {
      const response = await next.fetch(pathname)
      expect(response.status).toBe(200)
      const $ = load(await response.text())
      expect($('div').text()).toBe(
        'params.slug is docs/space%20here/with%2Fslash/fallback%25'
      )
    }
  })
})
