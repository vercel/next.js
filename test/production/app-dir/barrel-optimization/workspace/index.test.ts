import { nextTestSetup } from 'e2e-utils'

describe('app-dir - optimizePackageImports - workspace packages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should build and render workspace package barrel imports', async () => {
    const $ = await next.render$('/')
    expect($('#workspace-button').text()).toContain('workspace button')
  })
})
