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
    padding: 8px 16px;
    border-radius: var(--size-gap-triple);
    background: var(--color-background);
    color: var(--color-font);
  }

  .nextjs-static-indicator-toast-wrapper div {
    display: flex;
    flex-direction: row;
    align-items: center;
  }

  .nextjs-static-indicator-toast-wrapper p {
    padding: 4px;
    margin: 0;
  }
`

export { styles }
