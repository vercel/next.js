import { ErrorFeedback } from './error-feedback/error-feedback'
import { styles as feedbackStyles } from './error-feedback/error-feedback'

type ErrorOverlayFooterProps = {
  errorCode: string | undefined
}

export function ErrorOverlayFooter({ errorCode }: ErrorOverlayFooterProps) {
  return (
    <footer data-nextjs-error-overlay-footer className="error-overlay-footer">
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
      font-size: var(--size-14);
      font-weight: 500;
      margin: 0;
    }
  }

  ${feedbackStyles}
`
