import { nextTestSetup } from 'e2e-utils'

describe('proxy-unmatched-startup', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('loads the proxy only when a matching request arrives', async () => {
    const before = await next.render$('/')
    expect(before('#proxy-state').text()).toBe('cold')

    const response = await next.fetch('/guarded')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-proxy-ran')).toBe('1')
    expect(await response.text()).toContain('>loaded</p>')

    const after = await next.render$('/')
    expect(after('#proxy-state').text()).toBe('loaded')
  })
})
