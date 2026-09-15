import { nextTestSetup } from 'e2e-utils'

describe('app-dir - turbopack module graph cyclic CSS traces', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should build cyclic CSS modules without a module_graph root-path panic', async () => {
    const $ = await next.render$('/')
    expect($('#home').text()).toContain('home')

    expect(next.cliOutput).not.toContain('there must be a path to a root')
    expect(next.cliOutput).not.toContain('entered unreachable code')
    expect(next.cliOutput.toLowerCase()).not.toContain('panic')
  })

  if (isNextStart) {
    it('should serve the secondary page that shares the cyclic CSS graph', async () => {
      const $ = await next.render$('/other')
      expect($('#other').text()).toContain('other')

      expect(next.cliOutput).not.toContain('there must be a path to a root')
      expect(next.cliOutput).not.toContain('entered unreachable code')
      expect(next.cliOutput.toLowerCase()).not.toContain('panic')
    })
  }
})
