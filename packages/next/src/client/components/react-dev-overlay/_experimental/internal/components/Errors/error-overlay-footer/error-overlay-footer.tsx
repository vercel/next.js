import { ErrorFeedback } from './error-feedback/error-feedback'
import { styles as feedbackStyles } from './error-feedback/error-feedback'
import { noop as css } from '../../../helpers/noop-template'

export type ErrorOverlayFooterProps = {
  errorCode: string
  footerMessage?: string
}

export function ErrorOverlayFooter({
  errorCode,
  footerMessage,
}: ErrorOverlayFooterProps) {
  return (
    <footer className="error-overlay-footer">
      <p className="error-overlay-footer-message">{footerMessage}</p>
      <ErrorFeedback errorCode={errorCode} />
    </footer>
  )
}

export const styles = css`
  .error-overlay-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--size-3);
    background: var(--color-background-200);
    border-top: 1px solid var(--color-gray-400);
  }

  .error-overlay-footer p {
    color: var(--color-gray-900);
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
  }

  .error-overlay-footer-message {
    color: var(--color-gray-900);
    margin: 0;
    font-size: var(--size-font-small);
    font-weight: 400;
    line-height: var(--size-font-big);
  }

  ${feedbackStyles}
`
