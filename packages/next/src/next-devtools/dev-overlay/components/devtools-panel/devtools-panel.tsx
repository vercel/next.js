import { css } from '../../utils/css'

export function DevToolsPanel() {
  // TODO: Remove style; It is to indicate faster in the browser.
  return <div data-nextjs-devtools-panel>DevToolsPanel</div>
}

export const DEVTOOLS_PANEL_STYLES = css`
  [data-nextjs-devtools-panel] {
    color: black;
  }
`
