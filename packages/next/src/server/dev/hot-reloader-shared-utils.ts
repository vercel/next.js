import { getRegistry } from '../../lib/helpers/get-registry'
import { getPathMatch } from '../../shared/lib/router/utils/path-match'
import { parseVersionInfo, type VersionInfo } from './parse-version-info'

export const matchNextPageBundleRequest = getPathMatch(
  '/_next/static/chunks/pages/:path*.js(\\.map|)'
)

// The dist-tags request only feeds the version indicator. A registry that
// accepts the connection but never answers must not stall `next dev`: the
// webpack hot reloader awaits this in `start()`, and Turbopack before its
// first HMR sync.
const VERSION_INFO_FETCH_TIMEOUT_MS = 5_000

export async function getVersionInfo(): Promise<VersionInfo> {
  let installed = '0.0.0'

  try {
    installed = require('next/package.json').version

    let response

    try {
      const registry = await getRegistry()
      response = await fetch(`${registry}-/package/next/dist-tags`, {
        signal: AbortSignal.timeout(VERSION_INFO_FETCH_TIMEOUT_MS),
      })
    } catch {
      return { installed, staleness: 'unknown' }
    }
    const contentType = response.headers.get('content-type')

    if (
      !response.ok ||
      // only reject if content-type is explicitly not JSON, absent content-type is treated as valid registry response
      (contentType !== null && !contentType.includes('application/json'))
    ) {
      return { installed, staleness: 'unknown' }
    }

    const { latest, canary } = await response.json()

    return parseVersionInfo({ installed, latest, canary })
  } catch (e: any) {
    console.error(e)
    return { installed, staleness: 'unknown' }
  }
}
