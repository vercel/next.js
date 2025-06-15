import type { OverlayState } from '../../shared'

import { Eclipse } from '../../icons/eclipse'
import { getStaleness } from '../../../shared/version-staleness'
import { css } from '../../utils/css'

export function DevToolsPanelVersionInfo({
  versionInfo,
}: {
  versionInfo: OverlayState['versionInfo']
}) {
  const { staleness } = versionInfo
  const { text, indicatorClass, title } = getStaleness(versionInfo)
  const shouldBeLink = staleness.startsWith('stale')

  if (shouldBeLink) {
    return (
      <a
        data-nextjs-devtools-panel-footer-tab
        target="_blank"
        rel="noopener noreferrer"
        href="https://nextjs.org/docs/messages/version-staleness"
        title={title}
      >
        <Eclipse data-nextjs-version-staleness-indicator={indicatorClass} />
        <span>{text}</span>
      </a>
    )
  }

  return (
    <div data-nextjs-devtools-panel-footer-tab title={title}>
      <Eclipse data-nextjs-version-staleness-indicator={indicatorClass} />
      <span>{text}</span>
    </div>
  )
}

export const DEVTOOLS_PANEL_VERSION_INFO_STYLES = css`
  [data-nextjs-version-staleness-indicator='fresh'] {
    fill: var(--color-green-800);
    stroke: var(--color-green-300);
  }
  [data-nextjs-version-staleness-indicator='stale'] {
    fill: var(--color-amber-800);
    stroke: var(--color-amber-300);
  }
  [data-nextjs-version-staleness-indicator='outdated'] {
    fill: var(--color-red-800);
    stroke: var(--color-red-300);
  }
  [data-nextjs-version-staleness-indicator='unknown'] {
    fill: var(--color-gray-800);
    stroke: var(--color-gray-300);
  }
`
