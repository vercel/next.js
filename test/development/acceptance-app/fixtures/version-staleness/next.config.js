// Mocks the package registry that the dev server queries for version staleness
// (see `getVersionInfo()` in `packages/next/src/server/dev/hot-reloader-shared-utils.ts`).
// The registry comes from the package manager config, so any URL ending in the
// dist-tags path is intercepted. The fake dist-tags are a newer major than any
// installed version, so the installed `next` is always reported as outdated,
// without network access.
const DIST_TAGS_PATH = '/-/package/next/dist-tags'

if (!globalThis.__mockRegistryInstalled) {
  globalThis.__mockRegistryInstalled = true
  const originalFetch = globalThis.fetch

  globalThis.fetch = async function (input, init) {
    const url =
      typeof input === 'string' || input instanceof URL
        ? String(input)
        : input.url

    if (!new URL(url).pathname.endsWith(DIST_TAGS_PATH)) {
      return originalFetch.call(this, input, init)
    }

    return new Response(
      JSON.stringify({ latest: '999.0.0', canary: '999.0.0-canary.0' }),
      { headers: { 'content-type': 'application/json' } }
    )
  }
}

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {}

module.exports = nextConfig
