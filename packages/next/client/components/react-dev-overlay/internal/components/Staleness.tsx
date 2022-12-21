import * as React from 'react'

type Staleness = 'fresh' | 'stale' | 'outdated'

export type VersionInfo = Record<'installed' | 'latest' | 'canary', string>

const titles = {
  fresh: 'Next.js is up to date!',
  stale: 'Next.js is out of date, update recommended!',
  outdated: 'Next.js is out of date, update necessary!',
  undetermined: 'Could not determine Next.js version status.',
}

function compareVersions(a: string, b: string): Staleness {
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < 3; i++) {
    const na = Number(pa[i])
    const nb = Number(pb[i])
    if (na > nb) return 'fresh'
    if (nb > na) return 'stale'
    if (!isNaN(na) && isNaN(nb)) return 'fresh'
    if (isNaN(na) && !isNaN(nb)) return 'stale'
  }
  return 'fresh'
}

export function StalenessIndicator(props: VersionInfo) {
  const { installed, latest, canary } = props
  const [staleness, setStaleness] = React.useState<Staleness>()
  console.log(props)
  React.useEffect(() => {
    // const result = compareVersions(installed, latest)
    // setStaleness(result)
  }, [installed, canary, latest])

  return (
    <small
      title={titles[staleness ?? 'undetermined']}
      className="nextjs-container-build-error-version-status"
    >
      Next.js {installed}
      <span className={staleness} />
    </small>
  )
}
