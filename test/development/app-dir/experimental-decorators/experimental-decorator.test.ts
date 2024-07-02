import { nextTestSetup } from 'e2e-utils'
import { describeVariants } from 'next-test-utils'

describeVariants.each(['default'])('experimental decorators', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support stage 3 decorators', async () => {
    // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
    const resp = await next.fetch('/api/hello')
    const json = await resp.json()

    expect(json).toEqual({ text: 'hello world' })
  })
})
