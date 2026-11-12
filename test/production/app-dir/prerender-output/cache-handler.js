const { existsSync, writeFileSync, unlinkSync } = require('node:fs')
const FileSystemCache =
  require('next/dist/server/lib/incremental-cache/file-system-cache').default

const casesByKey = new Map()

module.exports = class CacheHandler extends FileSystemCache {
  constructor(options) {
    super(options)
    this.testCase = options._requestHeaders?.['x-prerender-output-case']
  }

  async get(key, context) {
    const entry = await super.get(key, context)
    if (this.testCase && !context.isFallback) {
      casesByKey.set(key, this.testCase)
    }
    const testCase = casesByKey.get(key)
    if (testCase && existsSync(testCase + '.miss')) {
      return null
    }
    if (entry && testCase && existsSync(testCase + '.stale')) {
      return { ...entry, lastModified: Date.now() - 120_000 }
    }
    return entry
  }

  async set(key, value, context) {
    await super.set(key, value, context)
    const testCase = casesByKey.get(key)
    if (!testCase) {
      return
    }
    const marker =
      testCase + (existsSync(testCase + '.miss') ? '.miss' : '.stale')
    if (existsSync(marker)) {
      writeFileSync(
        testCase + '.stored.json',
        JSON.stringify({ status: value.status, headers: value.headers })
      )
      unlinkSync(marker)
    }
  }
}
