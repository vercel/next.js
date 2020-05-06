import { noop as css } from '../../helpers/noop-template'

const styles = css`
  [data-nextjs-terminal] {
    border-radius: 0.3rem;
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
    padding: 0.5rem;
  }

  [data-nextjs-terminal] pre {
    white-space: pre-wrap;
    word-break: break-word;
  }
`

export { styles }
