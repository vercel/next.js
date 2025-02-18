import { noop as css } from '../../helpers/noop-template'

export { PseudoHtmlDiff } from '../../../../hydration-diff/diff-view'

export const PSEUDO_HTML_DIFF_STYLES = css`
  [data-nextjs-container-errors-pseudo-html] {
    margin: var(--size-2) 0;
    border: 1px solid var(--color-gray-400);
    background: var(--color-background-200);
    color: var(--color-syntax-constant);
    font-family: var(--font-stack-monospace);
    font-size: var(--size-font-smaller);
    line-height: var(--size-4);
    border-radius: var(--size-2);
  }
  [data-nextjs-container-errors-pseudo-html-line] {
    display: inline-block;
    width: 100%;
    padding-left: var(--size-10);
    line-height: calc(5 / 3);
  }
  [data-nextjs-container-errors-pseudo-html--diff='error'] {
    background: var(--color-amber-100);
    font-weight: bold;
  }
  [data-nextjs-container-errors-pseudo-html-collapse-button] {
    all: unset;
    margin-left: var(--size-3);
    &:focus {
      outline: none;
    }
  }
  [data-nextjs-container-errors-pseudo-html--diff='add'] {
    background: var(--color-green-300);
  }
  [data-nextjs-container-errors-pseudo-html-line-sign] {
    margin-left: calc(var(--size-6) * -1);
    margin-right: var(--size-6);
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
    margin-left: calc(var(--size-6) * -1);
    margin-right: var(--size-6);
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
    max-height: 100px;
    mask-image: linear-gradient(to top, rgba(0, 0, 0, 0) 0%, black 50%);
  }
  .nextjs__container_errors__component-stack code {
    display: block;
    width: 100%;
    white-space: pre-wrap;
    scroll-snap-type: y mandatory;
    overflow-y: hidden;
  }
  [data-nextjs-container-errors-pseudo-html--diff],
  [data-nextjs-container-errors-pseudo-html--diff='error'] {
    scroll-snap-align: center;
  }
  .error-overlay-hydration-error-diff-plus-icon {
    color: var(--color-green-900);
  }
  .error-overlay-hydration-error-diff-minus-icon {
    color: var(--color-red-900);
  }
`
