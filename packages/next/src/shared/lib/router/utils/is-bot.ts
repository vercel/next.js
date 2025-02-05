// Bot crawler that will spin up a headless browser and execute JS
const HEADLESS_BROWSER_BOT_UA_RE =
  /Googlebot|Google-PageRenderer|AdsBot-Google|googleweblight|Storebot-Google/i

// This regex contains the bots that we need to do a blocking render for and can't safely stream the response
// due to how they parse the DOM. For example, they might explicitly check for metadata in the `head` tag, so we can't stream metadata tags after the `head` was sent.
export const HTML_LIMITED_BOT_UA_RE_STRING =
  'Mediapartners-Google|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview'

export const HTML_LIMITED_BOT_UA_RE = new RegExp(
  HTML_LIMITED_BOT_UA_RE_STRING,
  'i'
)

function isDomBotUA(userAgent: string) {
  return HEADLESS_BROWSER_BOT_UA_RE.test(userAgent)
}

function isHtmlLimitedBotUA(userAgent: string) {
  return HTML_LIMITED_BOT_UA_RE.test(userAgent)
}

export function isBot(userAgent: string): boolean {
  return isDomBotUA(userAgent) || isHtmlLimitedBotUA(userAgent)
}

export function getBotType(userAgent: string): 'dom' | 'html' | undefined {
  if (isDomBotUA(userAgent)) {
    return 'dom'
  }
  if (isHtmlLimitedBotUA(userAgent)) {
    return 'html'
  }
  return undefined
}
