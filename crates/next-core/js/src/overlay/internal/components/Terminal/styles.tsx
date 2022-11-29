import { noop as css } from "../../helpers/noop-template";

const styles = css`
  .terminal {
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
    white-space: pre-wrap;
    word-break: break-word;
  }
`;

export { styles };
