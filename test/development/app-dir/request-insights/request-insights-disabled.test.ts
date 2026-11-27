import { nextTestSetup } from 'e2e-utils'

describe('request insights disabled through config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'next.config.js': `module.exports = {
  distDir: 'build',
  cacheComponents: true,
  experimental: { requestInsights: false },
}
`,
    },
  })

  it('does not serve the endpoint', async () => {
    await next.render('/')
    const response = await next.fetch('/_next/development/request-insights')
    expect(response.status).toBe(404)
  })
})
