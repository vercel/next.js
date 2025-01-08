import { noop as css } from '../../../helpers/noop-template'
import { DialogBody } from '../../Dialog'

type ErrorOverlayDialogBodyProps = {
  children?: React.ReactNode
  onClose?: () => void
}

export function ErrorOverlayDialogBody({
  children,
}: ErrorOverlayDialogBodyProps) {
  return (
    <DialogBody className="nextjs-container-errors-body">{children}</DialogBody>
  )
}

export const styles = css`
  .error-overlay-dialog {
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-xl);
    box-shadow: var(--shadow-md);
  }
`
