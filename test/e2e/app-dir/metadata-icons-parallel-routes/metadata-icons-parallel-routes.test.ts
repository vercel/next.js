import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata-icons-parallel-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should present favicon with other icons when parallel routes are presented', async () => {
    const $ = await next.render$('/')
    expect($('link[type="image/x-icon"]').length).toBe(1)
    expect($('link[type="image/svg+xml"]').length).toBe(1)
    expect($('link[rel="apple-touch-icon"]').length).toBe(1)
  })

  it('should override parent icon when both static icon presented', async () => {
    const $ = await next.render$('/nested')
    expect($('link[type="image/x-icon"]').length).toBe(1)
    expect($('link[rel="icon"][type="image/png"]').length).toBe(1)
  })

  it('should inherit parent apple icon when child does not present but parent contain static apple icon', async () => {
    const $ = await next.render$('/nested')
    expect($('link[rel="apple-touch-icon"][type="image/png"]').length).toBe(1)
  })
})
