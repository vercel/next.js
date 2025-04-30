import { nextTestSetup } from 'e2e-utils'

// Skip this is a webpack specific test in turbopack manifest.
describe('svgo-webpack loader', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      '@svgr/webpack': '8.1.0',
    },
  })

  it('should load icon properly with svgo webpack loader', async () => {
    const { status } = await next.fetch('/')
    expect(status).toBe(200)
  })
})
