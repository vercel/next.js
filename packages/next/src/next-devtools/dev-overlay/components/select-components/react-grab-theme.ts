import { css } from '../../utils/css'

// The upstream UI inherits the same tokens as the rest of Next.js Dev Tools.
// Keep these overrides in its own shadow root so its CSS reset cannot leak out.
export const REACT_GRAB_THEME = css`
  :host {
    --font-sans: var(--font-stack-sans);
    --rg-panel-bg: var(--color-background-100);
    --rg-text-primary: var(--color-gray-1000);
    --rg-text-secondary: var(--color-gray-900);
    --rg-surface-hover: var(--color-gray-100);
    --rg-surface-active: var(--color-gray-200);
    --rg-border-subtle: var(--color-gray-alpha-400);
    --rg-border-button: var(--color-gray-alpha-400);
    --rg-submit-bg: var(--color-gray-1000);
    --rg-submit-fg: var(--color-background-100);
    --rg-shadow: var(--shadow-menu);
    --rg-drop-shadow: none;
    --rg-text-primary-85: var(--color-gray-1000);
    --rg-error-text: var(--color-red-900);
    --rg-error-bg: var(--color-red-100);
    --rg-error-bg-hover: var(--color-red-200);
    font-family: var(--font-stack-sans);
  }
  [data-react-grab-toolbar-panel] {
    border: 1px solid var(--color-gray-alpha-400);
    border-radius: var(--rounded-lg);
  }
  [data-react-grab-selection-label] > div,
  [data-react-grab-context-menu] > div:last-child {
    border: 1px solid var(--color-gray-alpha-400);
    border-radius: var(--rounded-lg);
    box-shadow: var(--shadow-menu);
  }
  [data-react-grab-selection-label] {
    /* Upstream wraps --rg-shadow in drop-shadow(), which cannot take a shadow list. */
    filter: none !important;
  }
  [data-react-grab-context-menu] [role='menuitem'] {
    border-radius: var(--rounded-md-2);
    font-weight: 400;
  }
  :host button:focus-visible,
  :host [role='menuitem']:focus-visible {
    outline: var(--focus-ring) !important;
    outline-offset: 2px;
  }
`
