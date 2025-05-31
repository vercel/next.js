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
    border-radius: var(--rounded-md-2);
  }
  [data-nextjs-container-errors-pseudo-html-line] {
    display: inline-block;
    width: 100%;
    padding-left: 40px;
    line-height: calc(5 / 3);
  }
  [data-nextjs-container-errors-pseudo-html--diff='error'] {
    background: var(--color-amber-100);
    box-shadow: 2px 0 0 0 var(--color-amber-900) inset;
    font-weight: bold;
  }
  [data-nextjs-container-errors-pseudo-html-collapse-button] {
    all: unset;
    margin-left: 12px;
    &:focus {
      outline: none;
    }
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
    color: var(--color-amber-900);
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
  [data-nextjs-container-errors-pseudo-html-collapse='true']
    .nextjs__container_errors__component-stack
    code {
    max-height: 120px;
    mask-image: linear-gradient(to bottom,rgba(0,0,0,0) 0%,black 10%);
    padding-bottom: 40px;
  }
  .nextjs__container_errors__component-stack code {
    display: block;
    width: 100%;
    white-space: pre-wrap;
    scroll-snap-type: y mandatory;
    overflow-y: hidden;
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
`
