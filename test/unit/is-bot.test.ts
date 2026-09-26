/* eslint-env jest */
import {
  isBot,
  getBotType,
  HTML_LIMITED_BOT_UA_RE,
  HTML_LIMITED_BOT_UA_RE_STRING,
} from '../../packages/next/src/shared/lib/router/utils/is-bot'
import { shouldServeStreamingMetadata } from '../../packages/next/src/server/lib/streaming-metadata'

describe('is-bot utilities', () => {
  const newHtmlLimitedBots = [
    {
      name: 'TelegramBot',
      ua: 'TelegramBot (like TwitterBot)',
    },
    {
      name: 'ChatGPT-User',
      ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
    },
    {
      name: 'GPTBot',
      ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.0; +https://openai.com/gptbot',
    },
    {
      name: 'PerplexityBot',
      ua: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    },
    {
      name: 'ClaudeBot',
      ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    },
    {
      name: 'Claude-Web',
      ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-Web/1.0; +claude-web@anthropic.com)',
    },
    {
      name: 'Amazonbot',
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/600.2.5 (KHTML, like Gecko) Version/8.0.2 Safari/600.2.5 (Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)',
    },
    {
      name: 'Meta-ExternalAgent',
      ua: 'Mozilla/5.0 (compatible; Meta-ExternalAgent/1.1; +https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    },
    {
      name: 'Meta-ExternalFetcher',
      ua: 'Mozilla/5.0 (compatible; Meta-ExternalFetcher/1.0; +https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    },
  ]

  const existingHtmlLimitedBots = [
    {
      name: 'Twitterbot',
      ua: 'Twitterbot/1.0',
    },
    {
      name: 'facebookexternalhit',
      ua: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    },
    {
      name: 'WhatsApp',
      ua: 'WhatsApp/2.21.12.21 A',
    },
    {
      name: 'Slackbot',
      ua: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    },
    {
      name: 'Discordbot',
      ua: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    },
    {
      name: 'vkShare',
      ua: 'vkShare; +http://vk.com/dev/Share',
    },
    {
      name: 'Bingbot',
      ua: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    },
    {
      name: 'LinkedInBot',
      ua: 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    },
  ]

  const regularBrowsers = [
    {
      name: 'Chrome',
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    {
      name: 'Safari',
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    },
    {
      name: 'Firefox',
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
    },
  ]

  describe('new crawlers detection', () => {
    for (const { name, ua } of newHtmlLimitedBots) {
      it(`should detect ${name} as an HTML-limited bot`, () => {
        expect(isBot(ua)).toBe(true)
        expect(getBotType(ua)).toBe('html')
        expect(HTML_LIMITED_BOT_UA_RE.test(ua)).toBe(true)
        expect(shouldServeStreamingMetadata(ua, undefined)).toBe(false)
      })
    }
  })

  describe('existing crawlers detection', () => {
    for (const { name, ua } of existingHtmlLimitedBots) {
      it(`should detect ${name} as an HTML-limited bot`, () => {
        expect(isBot(ua)).toBe(true)
        expect(getBotType(ua)).toBe('html')
        expect(shouldServeStreamingMetadata(ua, undefined)).toBe(false)
      })
    }
  })

  describe('headless browser (DOM) bots', () => {
    const googlebot =
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

    it('should detect Googlebot as a DOM bot and allow streaming metadata', () => {
      expect(isBot(googlebot)).toBe(true)
      expect(getBotType(googlebot)).toBe('dom')
      expect(shouldServeStreamingMetadata(googlebot, undefined)).toBe(true)
    })
  })

  describe('regular browsers', () => {
    for (const { name, ua } of regularBrowsers) {
      it(`should not detect ${name} as a bot`, () => {
        expect(isBot(ua)).toBe(false)
        expect(getBotType(ua)).toBeUndefined()
        expect(shouldServeStreamingMetadata(ua, undefined)).toBe(true)
      })
    }
  })

  describe('shouldServeStreamingMetadata with custom config', () => {
    it('should support custom htmlLimitedBots pattern overriding defaults', () => {
      const customPattern = 'CustomCrawler'
      expect(
        shouldServeStreamingMetadata(
          'CustomCrawler/1.0',
          customPattern
        )
      ).toBe(false)
      expect(
        shouldServeStreamingMetadata(
          'Twitterbot/1.0',
          customPattern
        )
      ).toBe(true)
    })

    it('should return true for empty or undefined user-agent', () => {
      expect(shouldServeStreamingMetadata('', undefined)).toBe(true)
    })
  })
})
