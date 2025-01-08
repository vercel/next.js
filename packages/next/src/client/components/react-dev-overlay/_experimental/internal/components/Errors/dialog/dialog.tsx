import { Dialog } from '../../Dialog/Dialog'
import { noop as css } from '../../../helpers/noop-template'

type ErrorOverlayDialogProps = {
  children?: React.ReactNode
  onClose?: () => void
}

export function ErrorOverlayDialog({
  children,
  onClose,
}: ErrorOverlayDialogProps) {
  return (
    <Dialog
      type="error"
      aria-labelledby="nextjs__container_errors_label"
      aria-describedby="nextjs__container_errors_desc"
      onClose={onClose}
      className="error-overlay-dialog"
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
    position: relative;
  }
`
