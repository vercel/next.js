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
    expect(await $('title').text()).toBe('index page')
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
    expect(await $('title').length).toBe(0)
  })
})
