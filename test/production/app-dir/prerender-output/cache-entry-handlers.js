const { existsSync } = require('node:fs')
const { setTimeout: sleep } = require('node:timers/promises')

module.exports = (res) => {
  const onCacheEntry = async (entry, metadata) => {
    if (!entry.value || entry.value.kind !== 'APP_PAGE') {
      return false
    }
    if (
      metadata.url === '/prerender-output/partial/background' &&
      entry.value.html.contentType === 'text/x-component'
    ) {
      for (
        let attempts = 0;
        !existsSync('background.stored.json');
        attempts++
      ) {
        if (attempts === 2000) {
          throw new Error('Background prerender did not finish')
        }
        await sleep(10)
      }
      res.setHeader('x-observed-status', String(res.statusCode))
      res.setHeader('x-observed-headers-sent', String(res.headersSent))
    }
    if (metadata.url === '/prerender-output/static/callback') {
      res.setHeader('x-callback-status', String(res.statusCode))
      for (const [name, value] of Object.entries(entry.value.headers ?? {})) {
        if (value !== undefined) {
          res.setHeader(name, value)
        }
      }
      res.end(entry.value.html.toUnchunkedString())
      return true
    }
    return false
  }
  return { onCacheEntry, onCacheEntryV2: onCacheEntry }
}
