import { nextTestSetup } from 'e2e-utils'

describe('cache-components PPR bot static generation bypass', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should bypass static generation for bot requests to avoid SSG_BAILOUT', async () => {
    const res = await next.fetch('/foo', {
      headers: {
        'user-agent': 'Googlebot',
      },
    })
    // With cache components + PPR enabled, bots should use dynamic rendering
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

  it('should stream metadata for normal requests', async () => {
    const $ = await next.render$('/foo')

    expect($('head title').text()).not.toContain('Home')
    expect($('body title').text()).toBe('Home')
  })

  for (const userAgent of ['Googlebot', 'Google-PageRenderer']) {
    it(`should stream metadata for bot ${userAgent} without known head limitations`, async () => {
      const $ = await next.render$('/foo', undefined, {
        headers: {
          'user-agent': userAgent,
        },
      })

      expect($('head title').text()).not.toContain('Home')
      expect($('body title').text()).toBe('Home')
    })
  }

  it('should block metadata for an html limited bot', async () => {
    const $ = await next.render$('/foo', undefined, {
      headers: {
        'user-agent': 'Discordbot',
      },
    })

    expect($('head title').text()).toBe('Home')
    expect($('body title').text()).not.toContain('Home')
  })
})

describe('cache-components PPR customized htmlLimitedBots', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'next.config.js': `
        module.exports = {
          cacheComponents: true,
          htmlLimitedBots: /Minibot/i,
        }
      `,
    },
  })

  it('should block metadata for a configured html limited bot', async () => {
    const $ = await next.render$('/foo', undefined, {
      headers: {
        'user-agent': 'Minibot',
      },
    })

    expect($('head title').text()).toBe('Home')
    expect($('body title').text()).not.toContain('Home')
  })

  it('should stream metadata for Googlebot when it is not in the configured rule', async () => {
    const $ = await next.render$('/foo', undefined, {
      headers: {
        'user-agent': 'Googlebot',
      },
    })

    expect($('head title').text()).not.toContain('Home')
    expect($('body title').text()).toBe('Home')
  })
})
