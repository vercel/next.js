import { noop as css } from '../../helpers/noop-template'

const styles = css`
  .nextjs-toast {
    position: fixed;
    bottom: var(--size-gap-double);
    left: var(--size-gap-double);
    max-width: 420px;
    z-index: 9000;
    box-shadow: 0px var(--size-gap-double) var(--size-gap-quad)
      rgba(0, 0, 0, 0.25);
  }

  @media (max-width: 440px) {
    .nextjs-toast {
      max-width: 90vw;
      left: 5vw;
    }
  }

  .nextjs-toast-errors-parent {
    padding: 16px;
    border-radius: var(--size-gap-quad);
    font-weight: 500;
    color: var(--color-ansi-bright-white);
    background-color: var(--color-ansi-red);
  }

  .nextjs-static-indicator-toast-wrapper {
    width: 30px;
    height: 30px;
    overflow: hidden;
    border: 0;
    border-radius: var(--size-gap-triple);
    background: var(--color-background);
    color: var(--color-font);
    transition: all 0.3s ease-in-out;
    box-shadow:
      inset 0 0 0 1px var(--color-border-shadow),
      0 11px 40px 0 rgba(0, 0, 0, 0.25),
      0 2px 10px 0 rgba(0, 0, 0, 0.12);
  }

  .nextjs-static-indicator-toast-wrapper:hover {
    width: 140px;
  }

  .nextjs-static-indicator-toast-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
  }

  .nextjs-static-indicator-toast-text {
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    white-space: nowrap;
    transition: opacity 0.3s ease-in-out;
    line-height: 30px;
    position: absolute;
    left: 30px;
    top: 0;
  }

  .nextjs-static-indicator-toast-wrapper:hover
    .nextjs-static-indicator-toast-text {
    opacity: 1;
  }

  .nextjs-static-indicator-toast-wrapper button {
    color: var(--color-font);
    opacity: 0.8;
    background: none;
    border: none;
    margin-left: 6px;
    margin-top: -2px;
    outline: 0;
  }

  .nextjs-static-indicator-toast-wrapper button:focus {
    opacity: 1;
  }

  .nextjs-static-indicator-toast-wrapper button > svg {
    width: 16px;
    height: 16px;
  }
`

export { styles }
