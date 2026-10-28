import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

describe('segment-config-not-found-runtime', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('serves a Node-only custom 404 under an Edge root layout', async () => {
    const page = await next.render$('/')
    expect(page('#runtime').text()).toBe('nodejs')

    const response = await next.fetch('/missing')
    expect(response.status).toBe(404)
    const $ = load(await response.text())
    expect($('#runtime').text()).toBe('nodejs')
    expect($('#node-api').text()).toBe('function')
  })
})
