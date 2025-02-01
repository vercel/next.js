import { Dialog } from '../../dialog/dialog'
import { noop as css } from '../../../helpers/noop-template'

type ErrorOverlayDialogProps = {
  isTurbopack?: boolean
  children?: React.ReactNode
  onClose?: () => void
}

export function ErrorOverlayDialog({
  isTurbopack,
  children,
  onClose,
}: ErrorOverlayDialogProps) {
  return (
    <Dialog
      type="error"
      aria-labelledby="nextjs__container_errors_label"
      aria-describedby="nextjs__container_errors_desc"
      onClose={onClose}
      className={`error-overlay-dialog ${isTurbopack ? 'nextjs-error-overlay-dialog-turbopack-background' : ''}`}
    >
      {children}
    </Dialog>
  )
}

export const DIALOG_STYLES = css`
  .error-overlay-dialog {
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-xl);
    box-shadow: var(--shadow-md);
  }

  .nextjs-error-overlay-dialog-turbopack-background {
    border: 1px solid transparent;
    background:
      linear-gradient(var(--color-background-100), var(--color-background-100))
        padding-box,
      linear-gradient(
          to right top,
          var(--color-gray-400) 75%,
          var(--color-turbopack-border-blue) 87.5%,
          var(--color-turbopack-border-red) 100%
        )
        border-box;
  }
`
