import { ErrorFeedback } from './error-feedback/error-feedback'

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
