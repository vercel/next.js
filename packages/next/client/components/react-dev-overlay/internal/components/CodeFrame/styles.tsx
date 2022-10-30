import { noop as css } from '../../helpers/noop-template'

const styles = css`
  [data-nextjs-codeframe] {
    overflow: auto;
    border-radius: var(--size-gap-half);
    background-color: var(--color-ansi-bg);
    color: var(--color-ansi-fg);
  }
  [data-nextjs-codeframe]::selection,
  [data-nextjs-codeframe] *::selection {
    background-color: var(--color-ansi-selection);
  }
  [data-nextjs-codeframe] * {
    color: inherit;
    background-color: transparent;
    font-family: var(--font-stack-monospace);
  }

  [data-nextjs-codeframe] > * {
    margin: 0;
    padding: calc(var(--size-gap) + var(--size-gap-half))
      calc(var(--size-gap-double) + var(--size-gap-half));
  }
  [data-nextjs-codeframe] > div {
    display: inline-block;
    width: auto;
    min-width: 100%;
    border-bottom: 1px solid var(--color-ansi-bright-black);
  }
  [data-nextjs-codeframe] > div > p {
    position: relative;
    cursor: pointer;
    margin: 0;
    padding-right: calc(1em + 8px);
  }
  [data-nextjs-codeframe] > div > p:hover {
    text-decoration: underline dotted;
  }
  [data-nextjs-codeframe] div > p > svg {
    position: absolute;
    top: 50%;
    right: 0;
    width: 1em;
    height: 1em;
    transform: translate(0, -50%);
  }
  [data-nextjs-codeframe] div > pre {
    overflow: hidden;
    display: inline-block;
  }
`

export { styles }
