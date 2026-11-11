import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('metadata-streaming-edge-bots', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function readInitialHead(pathname: string, userAgent: string) {
    const controller = new AbortController()

    try {
      const response = await next.fetch(pathname, {
        headers: { 'user-agent': userAgent },
        signal: controller.signal,
      })
      expect(response.status).toBe(200)
      expect(response.body).not.toBeNull()

      const decoder = new TextDecoder()
      let html = ''

      // Transport chunks can split anywhere. Stop at the first closing head
      // rather than buffering the response, which could hide late metadata.
      for await (const chunk of response.body! as unknown as AsyncIterable<Uint8Array>) {
        html += decoder.decode(chunk, { stream: true })
        const headEnd = html.indexOf('</head>')
        if (headEnd !== -1) {
          return cheerio.load(html.slice(0, headEnd + '</head>'.length))
        }
      }

      throw new Error('Response ended without a closing </head>')
    } finally {
      controller.abort()
    }
  }

  describe.each([
    ['Edge', '/'],
    ['Node', '/node'],
  ])('%s runtime', (_runtime, pathname) => {
    it.each([
      ['ChatGPT-User', false],
      ['GPTBot', false],
      ['ClaudeBot', false],
      ['Twitterbot', true],
      ['TelegramBot (like TwitterBot)', true],
      ['Mozilla/5.0', false],
    ])(
      'respects metadata streaming policy for %s',
      async (userAgent, shouldBlock) => {
        const $ = await readInitialHead(pathname, userAgent)
        // With progressive loading disabled for non-JS bots, their render
        // waits for every boundary, so metadata resolves before the head is
        // sent and lands in it. The flag is enabled by the Cache Components
        // job env; the resolved-config gate conditions do not see env-forced
        // values in adapter deploy jobs, so read the env directly.
        const blocksForNonJsBot =
          process.env.__NEXT_CACHE_COMPONENTS === 'true' &&
          ['ChatGPT-User', 'GPTBot', 'ClaudeBot'].includes(userAgent)
        if (shouldBlock || blocksForNonJsBot) {
          expect($('head title').text()).toBe('Edge metadata title')
          expect($('head meta[name="description"]').attr('content')).toBe(
            'Edge metadata description'
          )
          expect($('head meta[property="og:title"]').attr('content')).toBe(
            'Edge Open Graph title'
          )
          expect(
            $('head meta[property="og:description"]').attr('content')
          ).toBe('Edge Open Graph description')
        } else {
          expect($('head title')).toHaveLength(0)
          expect($('head meta[name="description"]')).toHaveLength(0)
          expect($('head meta[property^="og:"]')).toHaveLength(0)
        }
      }
    )

    it('eventually includes the delayed metadata in the completed response', async () => {
      const response = await next.fetch(pathname, {
        headers: { 'user-agent': 'ChatGPT-User' },
      })
      expect(response.status).toBe(200)
      const $ = cheerio.load(await response.text())

      expect($('title').text()).toBe('Edge metadata title')
      expect($('meta[name="description"]').attr('content')).toBe(
        'Edge metadata description'
      )
      expect($('meta[property="og:title"]').attr('content')).toBe(
        'Edge Open Graph title'
      )
      expect($('meta[property="og:description"]').attr('content')).toBe(
        'Edge Open Graph description'
      )
    })
  })
})
