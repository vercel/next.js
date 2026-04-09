import { nextTestSetup } from 'e2e-utils'

describe('cache-components PPR bot static generation bypass', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should bypass static generation for DOM bot requests to avoid SSG_BAILOUT', async () => {
    const res = await next.fetch('/foo', {
      headers: {
        'user-agent': 'Googlebot',
      },
    })
    // With cache components + PPR enabled, DOM bots should behave like regular users
    // and use the fallback cache mechanism. This allows them to handle dynamic content
    // like Math.random() without triggering SSG_BAILOUT errors.
    expect(res.status).toBe(200)

    // Verify that the response contains the page content
    const html = await res.text()

    // Check that the page rendered successfully
    // With PPR, content is streamed via script tags
    expect(html).toContain('\\"children\\":\\"foo\\"')

    // Verify Math.random() was executed (check for a decimal number in the streamed content)
    expect(html).toMatch(/\\"children\\":0\.\d+/)

    // With PPR, content is streamed, but the important thing is that
    // the page rendered without a 500 error
  })
})
