import type { VersionInfo } from '../../../../../../../server/dev/parse-version-info'
import { cx } from '../../helpers/cx'
import { noop as css } from '../../helpers/noop-template'

export function VersionStalenessInfo({
  versionInfo,
  isTurbopack,
}: {
  versionInfo: VersionInfo
  isTurbopack?: boolean
}) {
  const { staleness } = versionInfo
  let { text, indicatorClass, title } = getStaleness(versionInfo)

  const shouldBeLink = staleness.startsWith('stale')
  if (shouldBeLink) {
    return (
      <a
        className={cx(
          'nextjs-container-build-error-version-status',
          'dialog-exclude-closing-from-outside-click',
          isTurbopack && 'turbopack-border'
        )}
        target="_blank"
        rel="noopener noreferrer"
        href="https://nextjs.org/docs/messages/version-staleness"
      >
        <Eclipse
          className={cx('version-staleness-indicator', indicatorClass)}
        />
        <span data-nextjs-version-checker title={title}>
          {text}
        </span>
        {isTurbopack && <span className="turbopack-text">Turbopack</span>}
      </a>
    )
  }

  return (
    <span className="nextjs-container-build-error-version-status dialog-exclude-closing-from-outside-click">
      <Eclipse className={cx('version-staleness-indicator', indicatorClass)} />
      <span data-nextjs-version-checker title={title}>
        {text}
      </span>
      {isTurbopack && <span className="turbopack-text">Turbopack</span>}
    </span>
  )
}

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

export const styles = css`
  .nextjs-container-build-error-version-status {
    -webkit-font-smoothing: antialiased;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--size-1);

    height: 26px;
    padding: 6px 8px 6px 6px;
    background: var(--color-background-100);
    background-clip: padding-box;
    border: 1px solid var(--color-gray-alpha-400);
    box-shadow: var(--shadow-small);
    border-radius: var(--rounded-full);

    color: var(--color-gray-900);
    font-size: 12px;
    font-weight: 500;
    line-height: var(--size-4);
  }

  a.nextjs-container-build-error-version-status {
    text-decoration: none;
    color: var(--color-gray-900);

    &:hover {
      background: var(--color-gray-100);
    }

    &:focus {
      outline: var(--focus-ring);
    }
  }

  .version-staleness-indicator.fresh {
    fill: var(--color-green-800);
    stroke: var(--color-green-300);
  }
  .version-staleness-indicator.stale {
    fill: var(--color-amber-800);
    stroke: var(--color-amber-300);
  }
  .version-staleness-indicator.outdated {
    fill: var(--color-red-800);
    stroke: var(--color-red-300);
  }
  .version-staleness-indicator.unknown {
    fill: var(--color-gray-800);
    stroke: var(--color-gray-300);
  }

  .nextjs-container-build-error-version-status > .turbopack-text {
    background: linear-gradient(
      to right,
      var(--color-turbopack-text-red) 0%,
      var(--color-turbopack-text-blue) 100%
    );
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`

function Eclipse({ className }: { className: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle className={className} cx="7" cy="7" r="5.5" strokeWidth="3" />
    </svg>
  )
}
