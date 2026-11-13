const fs = require('fs')
const path = require('path')

// Simulates a package registry that does not respond: the dev server's
// version-staleness request hangs until the test creates the marker file.
// The fake dist-tags then mark the installed version as outdated. The registry
// comes from the package manager config, so any URL ending in the dist-tags
// path is intercepted.
const DIST_TAGS_PATH = '/-/package/next/dist-tags'
const releaseMarker = path.join(__dirname, 'release-registry')

if (!globalThis.__hangingRegistryInstalled) {
  globalThis.__hangingRegistryInstalled = true
  const originalFetch = globalThis.fetch

  globalThis.fetch = async function (input, init) {
    const url =
      typeof input === 'string' || input instanceof URL
        ? String(input)
        : input.url

    if (!new URL(url).pathname.endsWith(DIST_TAGS_PATH)) {
      return originalFetch.call(this, input, init)
    }

    while (!fs.existsSync(releaseMarker)) {
      await new Promise((resolve) => setTimeout(resolve, 100))
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
