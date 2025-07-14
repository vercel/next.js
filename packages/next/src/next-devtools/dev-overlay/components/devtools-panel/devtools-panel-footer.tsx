import type { OverlayState } from '../../shared'

import { DevToolsPanelVersionInfo } from './devtools-panel-version-info'
import { css } from '../../utils/css'
import { RestartServerButton } from '../errors/error-overlay-toolbar/restart-server-button'

export function DevToolsPanelFooter({
  versionInfo,
  isDraggable,
  showRestartServerButton,
}: {
  versionInfo: OverlayState['versionInfo']
  isDraggable: boolean
  showRestartServerButton: boolean
}) {
  const bundlerName = (
    process.env.__NEXT_BUNDLER || 'WEBPACK'
  ).toUpperCase() as 'WEBPACK' | 'TURBOPACK' | 'RSPACK'
  return (
    <div
      data-nextjs-devtools-panel-footer
      data-nextjs-devtools-panel-draggable={isDraggable}
    >
      <div data-nextjs-devtools-panel-footer-tab-group>
        <DevToolsPanelVersionInfo versionInfo={versionInfo} />
        <div data-nextjs-devtools-panel-footer-tab>
          {/* TODO: The details may change, follow up. */}
          <span
            data-nextjs-devtools-panel-footer-tab-bundler-name={bundlerName}
          >
            {bundlerName}
          </span>
          <span data-nextjs-devtools-panel-footer-tab-bundler-status>
            enabled
          </span>
        </div>
      </div>
      {showRestartServerButton && (
        <div data-nextjs-devtools-panel-footer-tab-group>
          <RestartServerButton showButton={true} />
        </div>
      )}
    </div>
  )
}

export const DEVTOOLS_PANEL_FOOTER_STYLES = css`
  [data-nextjs-devtools-panel-footer] {
    background-color: var(--color-background-200);
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--color-gray-400);
    border-radius: 0 0 var(--rounded-xl) var(--rounded-xl);
    height: auto;
  }

  [data-nextjs-devtools-panel-footer-tab-group] {
    display: flex;
    align-items: center;
  }

  [data-nextjs-devtools-panel-footer-tab] {
    display: flex;
    align-items: center;
    padding: 12px;
    gap: 8px;
    align-self: stretch;
    border-right: 1px solid var(--color-gray-400);

    color: var(--color-gray-900);
    font-size: 12px;
    font-family: var(--font-stack-monospace);
  }

  [data-nextjs-devtools-panel-footer-tab-bundler-name='TURBOPACK'] {
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
