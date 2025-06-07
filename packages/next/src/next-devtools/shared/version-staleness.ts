import type { VersionInfo } from '../../server/dev/parse-version-info'

export function getStaleness({ installed, staleness, expected }: VersionInfo) {
  let text = ''
  let title = ''
  let indicatorClass = ''
  const versionLabel = `Next.js ${installed}`
  switch (staleness) {
    case 'newer-than-npm':
    case 'fresh':
      text = versionLabel
      title = `Latest available version is detected (${installed}).`
      indicatorClass = 'fresh'
      break
    case 'stale-patch':
    case 'stale-minor':
      text = `${versionLabel} (stale)`
      title = `There is a newer version (${expected}) available, upgrade recommended! `
      indicatorClass = 'stale'
      break
    case 'stale-major': {
      text = `${versionLabel} (outdated)`
      title = `An outdated version detected (latest is ${expected}), upgrade is highly recommended!`
      indicatorClass = 'outdated'
      break
    }
    case 'stale-prerelease': {
      text = `${versionLabel} (stale)`
      title = `There is a newer canary version (${expected}) available, please upgrade! `
      indicatorClass = 'stale'
      break
    }
    case 'unknown':
      text = `${versionLabel} (unknown)`
      title = 'No Next.js version data was found.'
      indicatorClass = 'unknown'
      break
    default:
      break
  }
  return { text, indicatorClass, title }
}
