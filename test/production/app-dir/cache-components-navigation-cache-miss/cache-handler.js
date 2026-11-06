const { existsSync, writeFileSync } = require('node:fs')
const { setTimeout: sleep } = require('node:timers/promises')

const entries = new Map()
let isHoldingFallbackShell = false

module.exports = class CacheHandler {
  constructor({ _requestHeaders: headers }) {
    this.holdsFallbackShell = headers?.['x-hold-fallback-shell'] === '1'
    if (isHoldingFallbackShell && headers?.rsc === '1') {
      writeFileSync('navigation-requested', '')
    }
  }

  async get(key, ctx) {
    if (this.holdsFallbackShell && ctx?.isFallback) {
      isHoldingFallbackShell = true
      writeFileSync('fallback-shell-held', '')
      while (!existsSync('release-fallback-shell')) {
        await sleep(10)
      }
      isHoldingFallbackShell = false
    }
    return entries.get(key) ?? null
  }

  async set(key, value) {
    entries.set(key, { value, lastModified: Date.now() })
  }

  async revalidateTag() {}

  resetRequestCache() {}
}
