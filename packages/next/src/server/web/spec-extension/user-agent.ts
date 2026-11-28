interface UserAgent {
  isBot: boolean
  ua: string
  browser: {
    name?: string
    version?: string
    major?: string
  }
  device: {
    model?: string
    type?: string
    vendor?: string
  }
  engine: {
    name?: string
    version?: string
  }
  os: {
    name?: string
    version?: string
  }
  cpu: {
    architecture?: string
  }
}

export function isBot(input: string): boolean {
  return /Googlebot|Mediapartners-Google|AdsBot-Google|googleweblight|Storebot-Google|Google-PageRenderer|Google-InspectionTool|Bingbot|BingPreview|Slurp|DuckDuckBot|baiduspider|yandex|sogou|LinkedInBot|bitlybot|tumblr|vkShare|quora link preview|facebookexternalhit|facebookcatalog|Twitterbot|applebot|redditbot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|ia_archiver|GPTBot/i.test(
    input
  )
}

// The parser builds its regular expressions when it is loaded, so it is loaded
// on first use and not with every import of `next/server`. It is kept here so
// that later calls do not go through `require()` again.
let parseua: typeof import('next/dist/compiled/ua-parser-js') | undefined

export function userAgentFromString(input: string | undefined): UserAgent {
  parseua ??=
    require('next/dist/compiled/ua-parser-js') as typeof import('next/dist/compiled/ua-parser-js')
  return {
    ...parseua(input),
    isBot: input === undefined ? false : isBot(input),
  }
}

export function userAgent({ headers }: { headers: Headers }): UserAgent {
  return userAgentFromString(headers.get('user-agent') || undefined)
}
