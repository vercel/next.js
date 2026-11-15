const fs = require('node:fs')
const path = require('node:path')
const FileSystemCache =
  require('next/dist/server/lib/incremental-cache/file-system-cache').default

// Exercise the public handler calls using keys as opaque strings. Delegate value
// formats, expiration and tags to Next's existing handler instead of replicating it.
module.exports = class RecordingCacheHandler extends FileSystemCache {
  record(operation, key, value, context) {
    if (value?.kind === 'FETCH') return
    const body = value?.kind === 'PAGES' ? value.pageData?.pageProps : undefined
    fs.appendFileSync(
      path.join(process.cwd(), 'cache-operations.jsonl'),
      JSON.stringify({
        operation,
        key,
        kind: value?.kind,
        hasRouteContext: 'route' in context,
        route: body?.route,
        params: body?.params,
      }) + '\n'
    )
  }
  async get(key, context) {
    const value = await super.get(key, context)
    if (context.kind !== 'FETCH') this.record('get', key, value?.value, context)
    return value
  }
  async set(key, value, context) {
    if (!context.fetchCache) this.record('set', key, value, context)
    return super.set(key, value, context)
  }
}
