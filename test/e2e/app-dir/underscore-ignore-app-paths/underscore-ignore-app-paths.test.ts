import { nextTestSetup } from 'e2e-utils'

describe('underscore-ignore-app-paths', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not serve app path with underscore', async () => {
    const res = await next.fetch('/_components')
    expect(res.status).toBe(404)
  })

  it('should serve pages path with underscore', async () => {
    const $ = await next.render$('/_dashboard')
    expect($('#result').text()).toBe('Should be served')
  })

  it('should serve app path with %5F', async () => {
    const $ = await next.render$('/_routable-folder')
    expect($('#result').text()).toBe('Should be served')
  })
})
