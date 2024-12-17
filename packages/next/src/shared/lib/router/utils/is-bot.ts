// Bot crawler that will spin up a headless browser and execute JS
const HEADLESS_BOT_UA_RE =
  /Googlebot|Google-PageRenderer|AdsBot-Google|googleweblight|Storebot-Google/i

// This regex contains the bots that we need to do static rendering for.
// - Static fetcher bot crawler that doesn't spin up a headless browser or execute JS
// - Bots that possible can do headless browser crawling but the crawler is limited to some restrictions.
const HTML_LIMITED_BOT_UA_RE =
  /Mediapartners-Google|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview/i

function isHeadlessBrowserBot(userAgent: string) {
  return HEADLESS_BOT_UA_RE.test(userAgent)
}

function isHtmlLimitedBot(userAgent: string) {
  return HTML_LIMITED_BOT_UA_RE.test(userAgent)
}

export function isBot(userAgent: string): boolean {
  return isHeadlessBrowserBot(userAgent) || isHtmlLimitedBot(userAgent)
}
