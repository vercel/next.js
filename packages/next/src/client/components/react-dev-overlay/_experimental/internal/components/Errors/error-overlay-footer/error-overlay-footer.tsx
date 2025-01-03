import { ErrorFeedback } from './error-feedback/error-feedback'

export type ErrorOverlayFooterProps = {
  errorCode: string
  message: string
}

export function ErrorOverlayFooter({
  errorCode,
  message,
}: ErrorOverlayFooterProps) {
  return (
    <footer className="error-overlay-footer">
      <p>{message}</p>
      <ErrorFeedback errorCode={errorCode} />
    </footer>
  )
}
