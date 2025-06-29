import { Warning } from '../../../../icons/warning'
import { css } from '../../../../utils/css'

export function IssuesTabEmptyContent() {
  return (
    <div data-nextjs-devtools-panel-tab-issues-empty>
      <div data-nextjs-devtools-panel-tab-issues-empty-content>
        <div data-nextjs-devtools-panel-tab-issues-empty-icon>
          <Warning width={16} height={16} />
        </div>
        <h3 data-nextjs-devtools-panel-tab-issues-empty-title>
          No Issues Found
        </h3>
        <p data-nextjs-devtools-panel-tab-issues-empty-subtitle>
          Issues will appear here when they occur.
        </p>
      </div>
    </div>
  )
}

export const DEVTOOLS_PANEL_TAB_ISSUES_EMPTY_CONTENT_STYLES = css`
  [data-nextjs-devtools-panel-tab-issues-empty] {
    display: flex;
    flex: 1;
    padding: 12px;
    min-height: 0;
  }

  [data-nextjs-devtools-panel-tab-issues-empty-content] {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    border: 1px dashed var(--color-gray-alpha-500);
    border-radius: 4px;
  }

  [data-nextjs-devtools-panel-tab-issues-empty-icon] {
    margin-bottom: 16px;
    padding: 8px;
    border: 1px solid var(--color-gray-alpha-400);
    border-radius: 6px;

    background-color: var(--color-background-100);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  [data-nextjs-devtools-panel-tab-issues-empty-title] {
    color: var(--color-gray-1000);
    font-size: 16px;
    font-weight: 500;
    line-height: var(--line-height-20);
  }

  [data-nextjs-devtools-panel-tab-issues-empty-subtitle] {
    color: var(--color-gray-900);
    font-size: 14px;
    line-height: var(--line-height-21);
  }
`
