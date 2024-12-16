// Bot crawler that will spin up a headless browser
const HEADLESS_BOT_UA_RE =
  /Googlebot|Google-PageRenderer|AdsBot-Google|googleweblight|Storebot-Google|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview/i

// Static fetcher bot crawler that doesn't spin up a headless browser or execute JS
const STATIC_FETCHER_BOT_UA_RE =
  /Mediapartners-Google|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver/i

function isHeadlessBrowserBot(userAgent: string) {
  return HEADLESS_BOT_UA_RE.test(userAgent)
}

function isNonBrowserBot(userAgent: string) {
  return STATIC_FETCHER_BOT_UA_RE.test(userAgent)
}

export function isBot(userAgent: string): boolean {
  return isHeadlessBrowserBot(userAgent) || isNonBrowserBot(userAgent)
}
