import { getRegistry } from '../../lib/helpers/get-registry'
import { getPathMatch } from '../../shared/lib/router/utils/path-match'
import { parseVersionInfo, type VersionInfo } from './parse-version-info'

export const matchNextPageBundleRequest = getPathMatch(
  '/_next/static/chunks/pages/:path*.js(\\.map|)'
)
export async function getVersionInfo(): Promise<VersionInfo> {
  let installed = '0.0.0'

  try {
    installed = require('next/package.json').version

    let res

    try {
      const registry = await getRegistry()
      // use NPM registry regardless user using Yarn
      res = await fetch(`${registry}-/package/next/dist-tags`)
    } catch {
      // ignore fetch errors
    }
    const contentType = res?.headers?.get?.('content-type')

    if (
      !res ||
      !res?.ok ||
      // only reject if content-type is explicitly not JSON, absent content-type is treated as valid registry response
      (contentType && contentType !== 'application/json')
    ) {
      return { installed, staleness: 'unknown' }
    }

    const { latest, canary } = await res.json()

    return parseVersionInfo({ installed, latest, canary })
  } catch (e: any) {
    console.error(e)
    return { installed, staleness: 'unknown' }
  }
}
