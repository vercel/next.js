// Bot crawler that will spin up a headless browser and execute JS
const HEADLESS_BOT_UA_RE =
  /Googlebot|Google-PageRenderer|AdsBot-Google|googleweblight|Storebot-Google/i

// This regex contains the bots that we need to do a blocking render for and can't safely stream the response
// due to how they parse the DOM. For example, they might explicitly check for metadata in the `head` tag, so we can't stream metadata tags after the `head` was sent.
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
