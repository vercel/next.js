const { existsSync, writeFileSync, unlinkSync } = require('node:fs')
const { setTimeout: sleep } = require('node:timers/promises')

const entries = new Map()
const casesByKey = new Map()
const writesByCase = new Map()

module.exports = class CacheHandler {
  constructor({ _requestHeaders: headers }) {
    this.testCase = headers?.cookie?.match(/(?:^|;\s*)test-case=([^;]+)/)?.[1]
    this.shellCase = headers?.['x-hold-shell']
    this.caller = headers?.cookie?.match(/(?:^|;\s*)caller=([^;]+)/)?.[1]
    this.isRSCRequest = headers?.rsc === '1'
    if (this.testCase && this.isRSCRequest) {
      writeFileSync(this.testCase + '.requested-' + this.caller, '')
    }
  }

  async get(key, context) {
    if (this.testCase && this.isRSCRequest && !context?.isFallback) {
      casesByKey.set(key, this.testCase)
    }
    if (this.shellCase && context?.isFallback) {
      writeFileSync(this.shellCase + '.shell-held', '')
      for (
        let attempts = 0;
        !existsSync(this.shellCase + '.shell-release');
        attempts++
      ) {
        if (attempts === 2000) {
          throw new Error('Fallback shell was not released')
        }
        await sleep(10)
      }
    }
    let entry = entries.get(key) ?? null
    const expired =
      entry !== null &&
      this.isRSCRequest &&
      this.testCase &&
      existsSync(this.testCase + '.expired')
    if (expired) {
      entry = {
        ...entry,
        lastModified: Date.now() - 3000,
        cacheControl: { revalidate: 1, expire: 2 },
      }
    }
    if (this.testCase && this.isRSCRequest && !context?.isFallback) {
      writeFileSync(
        this.testCase + '.lookup-' + this.caller,
        entry === null ? 'miss' : expired ? 'expired' : 'hit'
      )
    }
    return entry
  }

  async set(key, value, context) {
    entries.set(key, { value, lastModified: Date.now() })
    const testCase = casesByKey.get(key)
    if (testCase) {
      if (existsSync(testCase + '.expired')) {
        unlinkSync(testCase + '.expired')
      }
      const writes = (writesByCase.get(testCase) ?? 0) + 1
      writesByCase.set(testCase, writes)
      writeFileSync(
        testCase + '.stored.json',
        JSON.stringify({
          writes,
          hasPostponed: typeof value.postponed === 'string',
        })
      )
    }
    if (this.shellCase && context?.isFallback) {
      writeFileSync(
        this.shellCase + '.shell.json',
        JSON.stringify({
          hasPostponed: typeof value.postponed === 'string',
          hasRscData: value.rscData !== undefined,
        })
      )
    }
  }

  async revalidateTag() {}
  resetRequestCache() {}
}
