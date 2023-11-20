import { noop as css } from '../../helpers/noop-template'

const styles = css`
  .terminal {
    display: flex;
    flex-direction: column;
    overflow-y: hidden;

    border-radius: var(--size-gap-half);
    background-color: var(--color-ansi-bg);
    color: var(--color-ansi-fg);
  }

  .terminal::selection,
  .terminal *::selection {
    background-color: var(--color-ansi-selection);
  }

  .terminal * {
    color: inherit;
    background-color: transparent;
    font-family: var(--font-mono);
  }

  .terminal > * {
    margin: 0;
    padding: calc(var(--size-gap) + var(--size-gap-half))
      calc(var(--size-gap-double) + var(--size-gap-half));
  }

  .terminal pre {
    width: 100%;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-y: scroll;
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
