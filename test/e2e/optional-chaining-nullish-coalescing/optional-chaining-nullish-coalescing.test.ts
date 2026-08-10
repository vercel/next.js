import { nextTestSetup } from 'e2e-utils'

describe('Optional chaining and nullish coalescing support', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support optional chaining', async () => {
    const html = await next.render('/optional-chaining')
    expect(html).toMatch(/result1:.*?nothing/)
    expect(html).toMatch(/result2:.*?something/)
  })

  it('should support nullish coalescing', async () => {
    const html = await next.render('/nullish-coalescing')
    expect(html).toMatch(/result1:.*?fallback/)
    expect(html).not.toMatch(/result2:.*?fallback/)
  })
})
