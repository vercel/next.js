import { nextTestSetup } from 'e2e-utils'

describe('multiple-compiles-single-route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
  it('should not compile additional matching paths', async () => {
    const logs: string[] = []
    next.on('stdout', (log) => {
      logs.push(log)
    })
    await next.render('/about')
    // Check if `/[slug]` is mentioned in the logs as being compiled
    expect(logs.some((log) => log.includes('/[slug]'))).toBe(false)
  })
})
