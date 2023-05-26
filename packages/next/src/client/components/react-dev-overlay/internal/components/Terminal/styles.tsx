import { noop as css } from '../../helpers/noop-template'

const styles = css`
  [data-nextjs-terminal] {
    border-radius: var(--size-gap-half);
    background-color: var(--color-ansi-bg);
    color: var(--color-ansi-fg);
  }
  [data-nextjs-terminal]::selection,
  [data-nextjs-terminal] *::selection {
    background-color: var(--color-ansi-selection);
  }
  [data-nextjs-terminal] * {
    color: inherit;
    background-color: transparent;
    font-family: var(--font-stack-monospace);
  }
  [data-nextjs-terminal] > * {
    margin: 0;
    padding: calc(var(--size-gap) + var(--size-gap-half))
      calc(var(--size-gap-double) + var(--size-gap-half));
  }

  [data-nextjs-terminal] pre {
    white-space: pre-wrap;
    word-break: break-word;
  }

  [data-with-open-in-editor-link] svg {
    width: auto;
    height: var(--size-font-small);
    margin-left: var(--size-gap);
  }
  [data-with-open-in-editor-link] {
    cursor: pointer;
  }
  [data-with-open-in-editor-link]:hover {
    text-decoration: underline dotted;
  }
  [data-with-open-in-editor-link-source-file] {
    border-bottom: 1px solid var(--color-ansi-bright-black);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  [data-with-open-in-editor-link-import-trace] {
    margin-left: var(--size-gap-double);
  }
  [data-nextjs-terminal] a {
    color: inherit;
  }
`

export { styles }
