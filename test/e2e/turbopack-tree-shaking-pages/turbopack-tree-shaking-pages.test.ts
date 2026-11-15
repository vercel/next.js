import { nextTestSetup } from 'e2e-utils'

// Companion to the app-router #93424 regression: verify tree-shaking builds
// succeed for a pages-router app (no app-router global-error sharing).
describe('turbopack-tree-shaking-pages', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('builds and renders without a tree-shaking panic', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toContain('tree shaking pages')
  })
})
