import { ErrorFeedback } from './error-feedback/error-feedback'
import { styles as feedbackStyles } from './error-feedback/error-feedback'

export type ErrorOverlayFooterProps = {
  errorCode: string | undefined
  footerMessage: string | undefined
}

export function ErrorOverlayFooter({
  errorCode,
  footerMessage,
}: ErrorOverlayFooterProps) {
  return (
    <footer className="error-overlay-footer">
      {footerMessage ? (
        <p className="error-overlay-footer-message">{footerMessage}</p>
      ) : null}
      {errorCode ? (
        <ErrorFeedback className="error-feedback" errorCode={errorCode} />
      ) : null}
    </footer>
  )
}

export const styles = `
  .error-overlay-footer {
    display: flex;
    flex-direction: row;
    justify-content: space-between;

    gap: 8px;
    padding: 12px;
    background: var(--color-background-200);
    border-top: 1px solid var(--color-gray-400);
  }

  .error-feedback {
    margin-left: auto;

    p {
      font-size: var(--size-font-small);
      font-weight: 500;
      margin: 0;
    }
  }

  .error-overlay-footer-message {
    color: var(--color-gray-900);
    margin: 0;
    font-size: var(--size-font-small);
    font-weight: 400;
    line-height: var(--size-20);
  }

  ${feedbackStyles}
`
