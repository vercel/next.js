import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-mode', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('exposes the compilation mode to loaders', async () => {
    const $ = await next.render$('/')
    expect($('#mode').text()).toBe(isNextDev ? 'development' : 'production')
  })
})
