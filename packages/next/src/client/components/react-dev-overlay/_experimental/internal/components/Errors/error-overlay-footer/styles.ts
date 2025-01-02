import { noop as css } from '../../../helpers/noop-template'

const styles = css`
  .error-overlay-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .error-overlay-footer p {
    color: var(--color-gray-900);
    margin: 0;
  }

  .error-feedback {
    display: flex;
    align-items: center;
    gap: var(--size-gap);
  }

  .feedback-button {
    background: none;
    border: none;
    border-radius: var(--rounded-md);
    padding: var(--size-gap-half);
    width: 1.5rem; /* 24px */
    height: 1.5rem; /* 24px */
    display: flex;
    align-items: center;
    cursor: pointer;

    &:focus {
      outline: none;
    }

    &:hover {
      background: var(--color-gray-alpha-100);
    }

    &:active {
      background: var(--color-gray-alpha-200);
    }
  }

  .feedback-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .feedback-button.voted {
    background: var(--color-gray-alpha-200);
  }

  .thumbs-up-icon,
  .thumbs-down-icon {
    color: var(--color-gray-900);
  }

  .error-feedback-toast {
    width: 420px;
    height: auto;
    overflow: hidden;
    border: 0;
    padding: var(--size-gap-double);
    border-radius: var(--rounded-xl);
    background: var(--color-blue-700);
    bottom: var(--size-gap);
    right: var(--size-gap);
    left: auto;
  }

  .error-feedback-toast-text {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--color-font);
  }

  .error-feedback-toast-hide-button {
    width: var(--size-gap-quad);
    height: var(--size-gap-quad);
    border: none;
    background: none;
    &:focus {
      outline: none;
    }
    color: var(--color-font);
  }
`

export { styles }
