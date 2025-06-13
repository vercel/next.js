import { nextTestSetup } from 'e2e-utils'

describe('metadata-parallel-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should ignore metadata from default.js in normal route', async () => {
    const $ = await next.render$('/')
    // When there's no title, parallel routes should not affect it
    expect($('title').length).toBe(0)

    // When there's defined title, parallel routes should not affect it
    const $nested = await next.render$('/nested')
    expect($nested('title').text()).toBe('nested - page')
  })

  it('should ignore metadata from default.js in parallel routes', async () => {
    const $ = await next.render$('/nested/subroute')
    expect($('title').text()).toBe('subroute - page')
  })
})
