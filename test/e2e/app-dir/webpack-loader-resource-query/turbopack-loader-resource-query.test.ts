import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-resource-query', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
  it('should pass query to loader', async () => {
    await next.render$('/')

    expect(next.cliOutput).toContain('resource query:  ?test=hi')
  })
})
