import type { VersionInfo } from '../../../../../../server/dev/parse-version-info'

export function VersionStalenessInfo({
  versionInfo,
}: {
  versionInfo: VersionInfo | undefined
}) {
  if (!versionInfo) return null
  const { staleness } = versionInfo
  let { text, indicatorClass, title } = getStaleness(versionInfo)

  if (!text) return null

  return (
    <span className="nextjs-container-build-error-version-status">
      <span className={indicatorClass} />
      <small data-nextjs-version-checker title={title}>
        {text}
      </small>{' '}
      {staleness === 'fresh' ||
      staleness === 'newer-than-npm' ||
      staleness === 'unknown' ? null : (
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://nextjs.org/docs/messages/version-staleness"
        >
          (learn more)
        </a>
      )}
      {process.env.TURBOPACK ? ' (Turbopack)' : ''}
    </span>
  )
}

export function getStaleness({ installed, staleness, expected }: VersionInfo) {
  let text = ''
  let title = ''
  let indicatorClass = ''
  const versionLabel = `Next.js (${installed})`
  switch (staleness) {
    case 'newer-than-npm':
    case 'fresh':
      text = versionLabel
      title = `Latest available version is detected (${installed}).`
      indicatorClass = 'fresh'
      break
    case 'stale-patch':
    case 'stale-minor':
      text = `${versionLabel} out of date`
      title = `There is a newer version (${expected}) available, upgrade recommended! `
      indicatorClass = 'stale'
      break
    case 'stale-major': {
      text = `${versionLabel} is outdated`
      title = `An outdated version detected (latest is ${expected}), upgrade is highly recommended!`
      indicatorClass = 'outdated'
      break
    }
    case 'stale-prerelease': {
      text = `${versionLabel} is outdated`
      title = `There is a newer canary version (${expected}) available, please upgrade! `
      indicatorClass = 'stale'
      break
    }
    case 'unknown':
      break
    default:
      break
  }
  return { text, indicatorClass, title }
}
