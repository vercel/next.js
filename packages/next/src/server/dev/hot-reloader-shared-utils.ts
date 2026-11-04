import { getRegistry } from '../../lib/helpers/get-registry'
import { getPathMatch } from '../../shared/lib/router/utils/path-match'
import { parseVersionInfo, type VersionInfo } from './parse-version-info'

export const matchNextPageBundleRequest = getPathMatch(
  '/_next/static/chunks/pages/:path*.js(\\.map|)'
)
/**
 * Version info to send while the npm registry request from `getVersionInfo()`
 * is still pending. Never await that request before talking to the browser.
 * A slow registry would otherwise delay the dev overlay.
 */
export function getPendingVersionInfo(): VersionInfo {
  let installed = '0.0.0'
  try {
    installed = require('next/package.json').version
  } catch {}
  return { installed, staleness: 'unknown' }
}

export async function getVersionInfo(): Promise<VersionInfo> {
  let installed = '0.0.0'

  try {
    installed = require('next/package.json').version

    let response

    try {
      const registry = await getRegistry()
      response = await fetch(`${registry}-/package/next/dist-tags`)
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
