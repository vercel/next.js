import { Dialog } from '../../dialog/dialog'
import { noop as css } from '../../../helpers/noop-template'

type ErrorOverlayDialogProps = {
  children?: React.ReactNode
  onClose?: () => void
  dialogResizerRef?: React.RefObject<HTMLDivElement | null>
}

export function ErrorOverlayDialog({
  children,
  onClose,
  ...props
}: ErrorOverlayDialogProps) {
  return (
    <Dialog
      type="error"
      aria-labelledby="nextjs__container_errors_label"
      aria-describedby="nextjs__container_errors_desc"
      onClose={onClose}
      className="error-overlay-dialog"
      {...props}
    >
      {children}
    </Dialog>
  )
}

export const DIALOG_STYLES = css`
  .error-overlay-dialog {
    overflow-y: auto;
    -webkit-font-smoothing: antialiased;
    background: var(--color-background-100);
    background-clip: padding-box;
    border: 1px solid var(--color-gray-alpha-400);
    border-radius: var(--next-dialog-radius);
    box-shadow: var(--shadow-menu);
    position: relative;

    @media (prefers-color-scheme: dark) {
      border-color: var(--color-gray-400);
    }

    &:has(
        ~ [data-nextjs-error-overlay-nav] .error-overlay-notch[data-side='left']
      ) {
      border-top-left-radius: 0;
    }

    &:has(
        ~ [data-nextjs-error-overlay-nav]
          .error-overlay-notch[data-side='right']
      ) {
      border-top-right-radius: 0;
    }
  }
`
