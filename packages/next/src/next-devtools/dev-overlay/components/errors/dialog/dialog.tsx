import { Dialog } from '../../dialog/dialog'

type ErrorOverlayDialogProps = {
  children?: React.ReactNode
  onClose?: () => void
  footer?: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>

export function ErrorOverlayDialog({
  children,
  onClose,
  footer,
  ...props
}: ErrorOverlayDialogProps) {
  return (
    <div className="error-overlay-dialog-container">
      <Dialog
        aria-labelledby="nextjs__container_errors_label"
        aria-describedby="nextjs__container_errors_desc"
        className="error-overlay-dialog-scroll"
        onClose={onClose}
        {...props}
      >
        {children}
      </Dialog>
      {footer}
    </div>
  )
}

export const DIALOG_STYLES = `
  .error-overlay-dialog-container {
    display: flex;
    flex-direction: column;
    background: var(--color-background-100);
    background-clip: padding-box;
    border: var(--next-dialog-border-width) solid var(--color-gray-400);
    border-radius: 0 0 var(--next-dialog-radius) var(--next-dialog-radius);
    box-shadow: var(--shadow-menu);
    position: relative;
    overflow: hidden;
  }

  .error-overlay-dialog-scroll {
    overflow-y: auto;
    height: 100%;
  }
`
