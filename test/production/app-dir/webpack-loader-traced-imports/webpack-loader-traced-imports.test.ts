import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-traced-imports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('builds when a loader resolves a module with a dynamic require', async () => {
    const $ = await next.render$('/')
    expect($('main').text()).toBe('Webpack loader traced imports')
  })
})
