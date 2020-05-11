import { noop as css } from '../../helpers/noop-template'

const styles = css`
  [data-nextjs-codeframe] {
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
  [data-nextjs-codeframe] > hr {
    margin: 0;
    padding: 0;

    border: none;
    border-style: solid;
    border-width: 0;
    border-bottom-width: 1px;
    border-color: var(--color-ansi-bright-black);
  }

  [data-nextjs-codeframe] > p {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
  }
  [data-nextjs-codeframe] > p:hover {
    text-decoration: underline dotted;
  }
  [data-nextjs-codeframe] > p > svg {
    width: auto;
    height: 1em;
    margin-left: 0.5rem;
  }
`

export { styles }
