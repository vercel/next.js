import { parseVersionInfo, type VersionInfo } from './parse-version-info'

export type VersionInfoPayload =
  | {
      enabled: true
      registryURL: string
      installed: string
    }
  | {
      enabled: false
    }

export async function getVersionInfo({
  versionInfoPayload,
}: {
  versionInfoPayload: VersionInfoPayload
}): Promise<VersionInfo> {
  let installed = '0.0.0'

  if (!versionInfoPayload || !versionInfoPayload.enabled) {
    return { installed, staleness: 'unknown' }
  }

  try {
    installed = versionInfoPayload.installed
    let res

    try {
      res = await fetch(versionInfoPayload.registryURL)
    } catch {
      // ignore fetch errors
    }

    if (!res || !res.ok) return { installed, staleness: 'unknown' }

    const { latest, canary } = await res.json()

    return parseVersionInfo({ installed, latest, canary })
  } catch (e: any) {
    console.error(e)
    return { installed, staleness: 'unknown' }
  }
}
