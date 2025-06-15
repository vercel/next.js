import type { OverlayState } from '../../shared'

import { DevToolsPanelVersionInfo } from './devtools-panel-version-info'
import { QuestionIcon } from '../../icons/question'
import { BugIcon } from '../../icons/bug'
import { css } from '../../utils/css'

export function DevToolsPanelFooter({
  versionInfo,
}: {
  versionInfo: OverlayState['versionInfo']
}) {
  return (
    <div data-nextjs-devtools-panel-footer>
      <div data-nextjs-devtools-panel-footer-tab-group>
        <DevToolsPanelVersionInfo versionInfo={versionInfo} />
        <div data-nextjs-devtools-panel-footer-tab>
          <span>TURBOPACK</span>
          <span>{process.env.TURBOPACK ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>
      <div data-nextjs-devtools-panel-footer-action-button-group>
        {/* TODO: Add help feature, details TBD */}
        <button data-nextjs-devtools-panel-footer-action-button>
          <QuestionIcon width={16} height={16} />
        </button>
        {/* TODO: Add debugging/report GitHub issue feature, details TBD */}
        <button data-nextjs-devtools-panel-footer-action-button>
          <BugIcon width={16} height={16} />
        </button>
      </div>
    </div>
  )
}

export const DEVTOOLS_PANEL_FOOTER_STYLES = css`
  [data-nextjs-devtools-panel-footer] {
    background-color: var(--color-background-200);
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: auto;
    border-top: 1px solid var(--color-gray-400);
    border-radius: 0 0 var(--rounded-xl) var(--rounded-xl);
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

  [data-nextjs-devtools-panel-footer-action-button-group] {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-right: 8px;
  }

  [data-nextjs-devtools-panel-footer-action-button] {
    display: flex;
    justify-content: center;
    align-items: center;

    padding: 4px;
    background: var(--color-background-100);
    background-clip: padding-box;
    border: 1px solid var(--color-gray-alpha-400);
    box-shadow: var(--shadow-small);
    border-radius: var(--rounded-full);
    color: var(--color-gray-800);

    &:focus {
      outline: var(--focus-ring);
    }

    &:not(:disabled):hover {
      background: var(--color-gray-alpha-100);
    }

    &:not(:disabled):active {
      background: var(--color-gray-alpha-200);
    }

    &:disabled {
      background-color: var(--color-gray-100);
      cursor: not-allowed;
    }
  }
`
