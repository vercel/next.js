import { nextTestSetup } from 'e2e-utils'
;(process.env.TURBOPACK ? describe : describe.skip)(
  'turbopack-loader-resource-query',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
    it('should pass query to loader', async () => {
      await next.render$('/')

      expect(next.cliOutput).toContain('resource query:  ?test=hi')
    })
  }
)
