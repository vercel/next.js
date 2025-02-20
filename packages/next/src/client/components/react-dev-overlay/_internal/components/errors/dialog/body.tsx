import { noop as css } from '../../../helpers/noop-template'
import { DialogBody } from '../../dialog'

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

export const DIALOG_BODY_STYLES = css``
