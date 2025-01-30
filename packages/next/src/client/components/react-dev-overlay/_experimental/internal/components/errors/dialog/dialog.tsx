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
  ...props
}: ErrorOverlayDialogProps) {
  return (
    <Dialog
      type="error"
      aria-labelledby="nextjs__container_errors_label"
      aria-describedby="nextjs__container_errors_desc"
      onClose={onClose}
      className={`error-overlay-dialog ${isTurbopack ? 'turbo' : ''}`}
      {...props}
    >
      {children}
    </Dialog>
  )
}

export const DIALOG_STYLES = css`
  .error-overlay-dialog {
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
  }

  .turbo::after {
    content: '';
    --size: 1px;
    --gradient: linear-gradient(
      to right top,
      transparent 75%,
      var(--color-turbopack-border-blue) 87.5%,
      var(--color-turbopack-border-red) 100%
    );
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: var(--next-dialog-radius);
    padding: var(--size);
    background: var(--gradient);
    mask:
      linear-gradient(black, black) content-box,
      linear-gradient(black, black);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }
`
