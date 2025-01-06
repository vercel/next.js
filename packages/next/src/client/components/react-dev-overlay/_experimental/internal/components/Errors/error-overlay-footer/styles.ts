import { noop as css } from '../../../helpers/noop-template'

const styles = css`
  .error-overlay-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--size-3);
    background: var(--color-background-200);
    border: 1px solid var(--color-gray-400);
    border-bottom-left-radius: var(--rounded-xl);
    border-bottom-right-radius: var(--rounded-xl);
  }

  .error-overlay-footer p {
    color: var(--color-gray-900);
    margin: 0;
    line-height: var(--size-font-big);
  }

  .error-overlay-footer-message {
    color: var(--color-gray-900);
    margin: 0;
    font-size: var(--size-font-small);
    font-weight: 400;
    line-height: var(--size-font-big);
  }

  .error-feedback {
    display: flex;
    align-items: center;
    gap: var(--size-gap);
  }

  .error-feedback-thanks {
    height: 1.5rem; /* 24px */
    display: flex;
    align-items: center;
    padding-right: 4px; /* To match the 4px inner padding of the thumbs up and down icons */
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
`

export { styles }
