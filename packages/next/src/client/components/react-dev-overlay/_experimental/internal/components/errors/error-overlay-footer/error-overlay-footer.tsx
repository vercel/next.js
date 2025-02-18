import { ErrorFeedback } from './error-feedback/error-feedback'
import { styles as feedbackStyles } from './error-feedback/error-feedback'
import { noop as css } from '../../../helpers/noop-template'

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

export const styles = css`
  .error-overlay-footer {
    display: flex;
    flex-direction: row;
    justify-content: space-between;

    gap: var(--size-gap);
    padding: var(--size-3);
    background: var(--color-background-200);
    border-top: 1px solid var(--color-gray-400);
  }

  .error-feedback {
    margin-left: auto;

    p {
      font-size: 14px;
      font-weight: 500;
      margin: 0;
    }
  }

  .error-overlay-footer-message {
    color: var(--color-gray-900);
    margin: 0;
    font-size: 14px;
    font-weight: 400;
    line-height: var(--size-font-big);
  }

  ${feedbackStyles}
`
