// Reports any value that Next.js hands to the cache layer and that cannot be
// carried in an HTTP header.
//
// A cache implementation may serialize the tags, the soft tags, and the cache
// item name into request headers. Header values are limited to Latin-1, so a
// character above U+00FF cannot be represented and the conversion throws. A
// value that fails it never reaches the cache, and the read is
// indistinguishable from a miss.
//
// Only the value is constrained, not the header it ends up in, so the probe
// uses an arbitrary header name.
const CHECKED_FIELDS = ['tags', 'softTags', 'fetchUrl']
const PROBE_HEADER = 'x-cache-probe'

function reportUnrepresentableValues(operation, ctx) {
  for (const field of CHECKED_FIELDS) {
    const raw = ctx[field]
    const value = Array.isArray(raw) ? raw.join(',') : raw

    if (!value) {
      continue
    }

    try {
      new Headers({ [PROBE_HEADER]: value })
    } catch {
      console.error(
        `CACHE_PROBE unsafe ${operation} ${field} ${JSON.stringify(value)}`
      )
    }
  }
}

module.exports = class CacheHandler {
  async get(key, ctx = {}) {
    // Logged on every read so a test can tell "nothing unrepresentable" apart
    // from "the handler was never consulted".
    console.error(`CACHE_PROBE get`)
    reportUnrepresentableValues('get', ctx)

    return null
  }

  async set(key, data, ctx = {}) {
    reportUnrepresentableValues('set', ctx)
  }

  async revalidateTag() {}

  resetRequestCache() {}
}
