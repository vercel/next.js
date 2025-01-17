import type { VersionInfo } from '../../../../../../../server/dev/parse-version-info'
import { noop as css } from '../../helpers/noop-template'

export function VersionStalenessInfo({
  versionInfo,
  isTurbopack,
}: {
  versionInfo: VersionInfo | undefined
  isTurbopack?: boolean
}) {
  if (!versionInfo) return null
  const { staleness } = versionInfo
  let { text, indicatorClass, title } = getStaleness(versionInfo)

  if (!text) return null

  return (
    <span
      className={`nextjs-container-build-error-version-status dialog-exclude-closing-from-outside-click ${
        isTurbopack ? 'turbopack-border' : ''
      }`}
    >
      <Eclipse className={`version-staleness-indicator ${indicatorClass}`} />
      <span data-nextjs-version-checker title={title}>
        {text}
      </span>{' '}
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
      break
    default:
      break
  }
  return { text, indicatorClass, title }
}

export const styles = css`
  .nextjs-container-build-error-version-status {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--size-1);

    padding: var(--size-1_5) var(--size-2);
    background: var(--color-background-100);
    box-shadow: var(--shadow-sm);

    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-full);

    color: var(--color-gray-900);
    font-size: var(--size-font-11);
    font-weight: 500;
    line-height: var(--size-4);
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

  .nextjs-container-build-error-version-status.turbopack-border {
    border: 1px solid transparent;
    background:
      linear-gradient(var(--color-background-100), var(--color-background-100))
        padding-box,
      linear-gradient(
          to right,
          var(--color-turbopack-border-red) 0%,
          var(--color-turbopack-border-blue) 100%
        )
        border-box;
    border-radius: var(--rounded-full);
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
