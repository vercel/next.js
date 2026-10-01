import { nextTestSetup } from 'e2e-utils'

describe('turbopack-tree-shaking-chunkgroup', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('builds an app-router app with tree-shaking enabled and renders', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toContain('tree shaking app')
  })
})
