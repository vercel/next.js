import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app-dir metadata-json-manifest', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support metadata.json manifest', async () => {
    const response = await next.fetch('/manifest.json')
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json).toEqual({
      name: 'My Next.js Application',
      short_name: 'Next.js App',
      description: 'An application built with Next.js',
      start_url: '/',
    })
  })
})
