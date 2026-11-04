import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-source-maps', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NODE_OPTIONS: '--enable-source-maps',
    },
  })

  it.each([
    ['first', 'first-error', /first\.mapped\.js:2:\d+/],
    ['second', 'second-error', /second\.mapped\.js:4:\d+/],
    ['plain', 'plain-error', /plain\.js:2:\d+/],
  ])(
    'maps the %s module back to its original line',
    async (probe, message, location) => {
      const response = await next.fetch(`/api/source-map?probe=${probe}`)
      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.message).toBe(message)
      expect(result.stack).toMatch(location)
    }
  )
})
