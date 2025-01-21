import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata-streaming-customized-rule', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'next.config.js': `
        module.exports = {
          experimental: {
            streamingMetadata: true,
            htmlLimitedBots: /Minibot/i,
          }
        }
      `,
    },
  })

  it('should send the blocking response for html limited bots', async () => {
    const $ = await next.render$(
      '/',
      undefined, // no query
      {
        headers: {
          'user-agent': 'Minibot',
        },
      }
    )
    expect(await $('head title').text()).toBe('index page')
    expect(await $('body title').length).toBe(0)
  })

  it('should send streaming response for headless browser bots', async () => {
    const $ = await next.render$(
      '/',
      undefined, // no query
      {
        headers: {
          'user-agent': 'Weebot',
        },
      }
    )
    expect(await $('head title').length).toBe(0)
    expect(await $('body title').length).toBe(1)
  })
})
