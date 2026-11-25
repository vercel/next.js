export { PseudoHtmlDiff } from '../../components/hydration-diff/diff-view'

export const PSEUDO_HTML_DIFF_STYLES = `
  [data-nextjs-container-errors-pseudo-html] {
    padding: 8px 0;
    margin: 8px 0;
    border: 1px solid var(--color-gray-400);
    background: var(--color-background-200);
    color: var(--color-syntax-constant);
    font-family: var(--font-stack-monospace);
    font-size: var(--size-12);
    line-height: 1.33em; /* 16px in 12px font size */
    border-radius: var(--rounded-xl);
  }
  [data-nextjs-container-errors-pseudo-html-line] {
    display: inline-block;
    width: 100%;
    padding-left: 40px;
    line-height: calc(5 / 3);
  }
  [data-nextjs-container-errors-pseudo-html--diff='error'] {
    background: var(--color-red-200);
    box-shadow: 2px 0 0 0 var(--color-red-900) inset;
    font-weight: bold;
  }
  [data-nextjs-container-errors-pseudo-html--diff='add'] {
    background: var(--color-green-300);
  }
  [data-nextjs-container-errors-pseudo-html-line-sign] {
    margin-left: calc(24px * -1);
    margin-right: 24px;
  }
  [data-nextjs-container-errors-pseudo-html--diff='add']
    [data-nextjs-container-errors-pseudo-html-line-sign] {
    color: var(--color-green-900);
  }
  [data-nextjs-container-errors-pseudo-html--diff='remove'] {
    background: var(--color-red-300);
  }
  [data-nextjs-container-errors-pseudo-html--diff='remove']
    [data-nextjs-container-errors-pseudo-html-line-sign] {
    color: var(--color-red-900);
    margin-left: calc(24px * -1);
    margin-right: 24px;
  }
  [data-nextjs-container-errors-pseudo-html--diff='error']
    [data-nextjs-container-errors-pseudo-html-line-sign] {
    color: var(--color-red-900);
  }
  ${/* hide but text are still accessible in DOM */ ''}
  [data-nextjs-container-errors-pseudo-html--hint] {
    display: inline-block;
    font-size: 0;
    height: 0;
  }
  [data-nextjs-container-errors-pseudo-html--tag-adjacent='false'] {
    color: var(--color-accents-1);
  }
  .nextjs__container_errors__component-stack {
    margin: 0;
  }
  .nextjs__container_errors__component-stack code {
    display: block;
    width: 100%;
    white-space: pre-wrap;
    scroll-snap-type: y mandatory;
    overflow-y: hidden;
  }
  [data-nextjs-hydration-diff-type] {
    color: var(--color-gray-1000);
    font-size: var(--size-13);
    overflow: hidden;
    padding: 0;
  }
  [data-nextjs-hydration-diff-type]
    [data-nextjs-container-errors-pseudo-html-line] {
    box-sizing: border-box;
    font-weight: normal;
    line-height: var(--size-20);
  }
  [data-nextjs-hydration-diff-type='invalid-html']
    [data-nextjs-container-errors-pseudo-html-line-sign] {
    color: var(--color-gray-alpha-1000);
  }
  [data-nextjs-hydration-diff-type]
    .nextjs__container_errors__component-stack,
  [data-nextjs-hydration-diff-type]
    .nextjs__container_errors__component-stack code {
    overflow-x: hidden;
    overflow-wrap: anywhere;
  }
  [data-nextjs-hydration-diff-type]
    .nextjs__container_errors__component-stack {
    background: var(--color-background-100);
    padding: 8px 0 10px;
  }
  [data-nextjs-hydration-diff-title] {
    color: var(--color-gray-900);
    font-family: var(--font-stack-sans);
    font-size: var(--size-12);
  }
  [data-nextjs-container-errors-pseudo-html-collapse-button] {
    all: unset;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    border-radius: var(--rounded-md);
  }
  [data-nextjs-container-errors-pseudo-html-collapse-button]:focus-visible {
    outline: 2px solid var(--color-blue-600);
    outline-offset: 2px;
  }
  [data-nextjs-container-errors-pseudo-html--diff] {
    scroll-snap-align: center;
  }
  .error-overlay-hydration-error-diff-plus-icon {
    color: var(--color-green-900);
  }
  .error-overlay-hydration-error-diff-minus-icon {
    color: var(--color-red-900);
  }
  [data-nextjs-hydration-diff-header] {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--color-gray-200);
    min-height: 36px;
    padding: 0 12px;
  }
  [data-nextjs-hydration-diff-badge] {
    display: flex;
    gap: 8px;
    font-size: var(--size-12);
  }
  [data-nextjs-hydration-diff-badge-item] {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--color-gray-900);
  }
  [data-nextjs-hydration-diff-badge-item='client'] span:first-child {
    color: var(--color-green-900);
    font-weight: bold;
  }
  [data-nextjs-hydration-diff-badge-item='server'] span:first-child {
    color: var(--color-red-900);
    font-weight: bold;
  }
`
