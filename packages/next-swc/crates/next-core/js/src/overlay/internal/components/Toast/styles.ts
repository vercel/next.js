import { noop as css } from '../../helpers/noop-template'

const styles = css`
  .toast {
    position: fixed;
    bottom: var(--size-gap-double);
    left: var(--size-gap-double);
    max-width: 420px;
    z-index: 9000;
  }

  @media (max-width: 440px) {
    .toast {
      max-width: 90vw;
      left: 5vw;
    }
  }

  .toast-wrapper {
    padding: 16px;
    border-radius: var(--size-gap-half);
    font-weight: 600;
    box-shadow: 0px var(--size-gap-double) var(--size-gap-quad)
      rgba(0, 0, 0, 0.25);
  }

  .toast[data-severity='error'] > .toast-wrapper {
    color: var(--color-text-white);
    background-color: var(--color-error);
  }

  .toast[data-severity='warning'] > .toast-wrapper {
    color: var(--color-text-white);
    background-color: var(--color-warning);
  }
`

export { styles }
