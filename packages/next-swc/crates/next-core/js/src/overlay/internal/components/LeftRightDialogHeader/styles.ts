import { noop as css } from "../../helpers/noop-template";

const styles = css`
  .dialog-left-right > button {
    --bg-alpha: 0.1;
    --fg-alpha: 1;

    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: calc(var(--size-gap-double) + var(--size-gap));
    height: calc(var(--size-gap-double) + var(--size-gap));
    font-size: 0;
    border: none;

    background-color: hsla(var(--color-base), var(--bg-alpha));
    color: hsla(var(--color-base), var(--fg-alpha));

    cursor: pointer;
    transition: background-color 0.25s ease;
  }

  .dialog-left-right[data-severity="error"] > button {
    --color-base: var(--color-error-bright-hsl);
  }

  .dialog-left-right[data-severity="warning"] > button {
    --color-base: var(--color-warning-bright-hsl);
  }

  .dialog-left-right > button:hover {
    --bg-alpha: 0.2;
  }

  .dialog-left-right > button:disabled {
    --bg-alpha: 0.1;
    --fg-alpha: 0.4;
    cursor: not-allowed;
  }

  .dialog-left-right > button:first-of-type {
    border-radius: var(--size-gap-half) 0 0 var(--size-gap-half);
    margin-right: 1px;
  }

  .dialog-left-right > button:last-of-type {
    border-radius: 0 var(--size-gap-half) var(--size-gap-half) 0;
  }

  .dialog-left-right > button > svg {
    width: auto;
    height: var(--size-icon-small);
  }
`;

export { styles };
