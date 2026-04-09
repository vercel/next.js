import type { VersionInfo } from '../../../../server/dev/parse-version-info'
import { getStaleness } from '../../../shared/version-staleness'
import { cx } from '../../utils/cx'
import { EclipseIcon } from '../../icons/eclipse'

export function VersionStalenessInfo({
  versionInfo,
  bundlerName,
}: {
  versionInfo: VersionInfo
  // Passed from parent for easier handling in Storybook.
  bundlerName: 'Webpack' | 'Turbopack' | 'Rspack'
}) {
  const { staleness } = versionInfo
  let { text, indicatorClass, title } = getStaleness(versionInfo)

  const isTurbopack = bundlerName === 'Turbopack'
  const shouldBeLink = staleness.startsWith('stale')
  if (shouldBeLink) {
    return (
      <a
        className="nextjs-container-build-error-version-status dialog-exclude-closing-from-outside-click"
        target="_blank"
        rel="noopener noreferrer"
        href="https://nextjs.org/docs/messages/version-staleness"
      >
        <EclipseIcon
          className={cx('version-staleness-indicator', indicatorClass)}
        />
        <span data-nextjs-version-checker title={title}>
          {text}
        </span>
        <span className={cx(isTurbopack && 'turbopack-text')}>
          {bundlerName}
        </span>
      </a>
    )
  }

  return (
    <span className="nextjs-container-build-error-version-status dialog-exclude-closing-from-outside-click">
      <EclipseIcon
        className={cx('version-staleness-indicator', indicatorClass)}
      />
      <span data-nextjs-version-checker title={title}>
        {text}
      </span>
      <span className={cx(isTurbopack && 'turbopack-text')}>{bundlerName}</span>
    </span>
  )
}

export const styles = `
  .nextjs-container-build-error-version-status {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 4px;

    height: var(--size-26);
    padding: 6px 8px 6px 6px;
    background: var(--color-background-100);
    background-clip: padding-box;
    border: 1px solid var(--color-gray-alpha-400);
    box-shadow: var(--shadow-small);
    border-radius: var(--rounded-full);

    color: var(--color-gray-900);
    font-size: var(--size-12);
    font-weight: 500;
    line-height: var(--size-16);
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
