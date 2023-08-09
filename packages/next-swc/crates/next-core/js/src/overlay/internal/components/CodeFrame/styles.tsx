import { noop as css } from '../../helpers/noop-template'

const styles = css`
  .codeframe {
    overflow: auto;
    border-radius: var(--size-gap-half);
    background-color: var(--color-ansi-bg);
    color: var(--color-ansi-fg);
  }
  .codeframe::selection,
  .codeframe *::selection {
    background-color: var(--color-ansi-selection);
  }
  .codeframe * {
    color: inherit;
    background-color: transparent;
    font-family: var(--font-mono);
  }

  .codeframe > * {
    margin: 0;
    padding: calc(var(--size-gap) + var(--size-gap-half))
      calc(var(--size-gap-double) + var(--size-gap-half));
  }
  .codeframe > div {
    display: inline-block;
    width: auto;
    min-width: 100%;
    border-bottom: 1px solid var(--color-ansi-bright-black);
  }
  .codeframe > div > p {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    margin: 0;
  }
  .codeframe > div > p:hover {
    text-decoration: underline dotted;
  }
  .codeframe div > p > svg {
    width: auto;
    height: 1em;
    margin-left: 8px;
  }
  .codeframe div > pre {
    overflow: hidden;
    display: inline-block;
  }
`

export { styles }
