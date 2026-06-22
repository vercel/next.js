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
      const registry = getRegistry()
      // use NPM registry regardless user using Yarn
      res = await fetch(`${registry}-/package/next/dist-tags`).then(
        async (response) => {
          if (!response || !response.ok) {
            return { installed, staleness: 'unknown' }
          }

          return await response.json()
        }
      )
    } catch {
      // ignore fetch errors
    }

    if ('staleness' in res && res['staleness'] === 'unknown') return res

    const { latest, canary } = res

    return parseVersionInfo({ installed, latest, canary })
  } catch (e: any) {
    console.error(e)
    return { installed, staleness: 'unknown' }
  }
}
