import { noop as css } from '../../helpers/noop-template'

const styles = css`
  .terminal {
    display: flex;
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
`

export { styles }
