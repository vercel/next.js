import { noop as css } from '../../helpers/noop-template'

export { PseudoHtmlDiff } from '../../../hydration-diff/diff-view'

export const styles = css`
  [data-nextjs-container-errors-pseudo-html] {
    position: relative;
  }
  [data-nextjs-container-errors-pseudo-html-collapse-button] {
    position: absolute;
    left: 10px;
    top: 10px;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
  }
  [data-nextjs-container-errors-pseudo-html-line] {
    display: inline-block;
    width: 100%;
    padding-left: var(--size-10);
    font-size: var(--size-font-small);
    line-height: calc(5 / 3);
    white-space: pre;
  }
  [data-nextjs-container-errors-pseudo-html--diff='add'] {
    color: var(--color-ansi-green);
  }
  [data-nextjs-container-errors-pseudo-html--diff='remove'] {
    color: var(--color-ansi-red);
  }
  [data-nextjs-container-errors-pseudo-html--diff='error'] {
    color: var(--color-ansi-yellow);
    font-weight: bold;
  }
  [data-nextjs-container-errors-pseudo-html--tag-error] {
    color: var(--color-ansi-red);
    font-weight: bold;
  }
  ${/* hide but text are still accessible in DOM */ ''}
  [data-nextjs-container-errors-pseudo-html--hint] {
    display: inline-block;
    font-size: 0;
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
`
