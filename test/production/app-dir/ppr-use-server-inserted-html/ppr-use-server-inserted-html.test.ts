import { nextTestSetup } from 'e2e-utils'

describe('ppr-use-server-inserted-html', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  if (isNextStart) {
    it('should mark the route as ppr rendered', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )
      expect(prerenderManifest.routes['/partial-resume'].renderingMode).toBe(
        'PARTIALLY_STATIC'
      )
    })
  }

  it('should not log insertion in build', async () => {
    const output = next.cliOutput
    expect(output).not.toContain('testing-log-insertion:')
  })

  it('should insert the html insertion into html body', async () => {
    const $ = await next.render$('/partial-resume')
    const output = next.cliOutput
    expect(output).toContain('testing-log-insertion:dynamic-data')

    expect($('head [data-test-id]').length).toBe(0)
    expect($('body [data-test-id]').length).toBe(1)
  })
})
