import { Dialog } from '../../dialog/dialog'
import { noop as css } from '../../../helpers/noop-template'

type ErrorOverlayDialogProps = {
  isTurbopack?: boolean
  children?: React.ReactNode
  onClose?: () => void
  count: number
  activeIdx: number
}

export function ErrorOverlayDialog({
  isTurbopack,
  children,
  onClose,
  count,
  activeIdx,
}: ErrorOverlayDialogProps) {
  let stackCount = '0'

  if (count > 1) {
    stackCount = '1'
  }

  if (count > 2) {
    stackCount = '2'
  }

  if (activeIdx === 1) {
    stackCount = '1'
  }

  if (activeIdx > 1) {
    stackCount = '0'
  }

  return (
    <Dialog
      type="error"
      aria-labelledby="nextjs__container_errors_label"
      aria-describedby="nextjs__container_errors_desc"
      onClose={onClose}
      className={`error-overlay-dialog ${isTurbopack ? 'nextjs-error-overlay-dialog-turbopack-background' : ''}`}
      data-stack-count={stackCount}
    >
      {children}
    </Dialog>
  )
}

export const DIALOG_STYLES = css`
  .error-overlay-dialog {
    --timing: cubic-bezier(0.23, 0.88, 0.26, 0.92);
    --stack-offset: 10px;
    --shadow: 0px 0.925px 0.925px 0px rgba(0, 0, 0, 0.02),
      0px 3.7px 7.4px -3.7px rgba(0, 0, 0, 0.04),
      0px 14.8px 22.2px -7.4px rgba(0, 0, 0, 0.06);
    -webkit-font-smoothing: antialiased;
    background: var(--color-background-100);
    background-clip: padding-box;
    border: 1px solid var(--color-gray-alpha-400);
    border-radius: var(--rounded-xl);
    box-shadow: var(--shadow-menu);
    position: relative;

    &:before,
    &:after {
      content: '';
      position: absolute;
      width: 100%;
      padding: var(--size-3);
      align-self: center;
      z-index: -1;
      bottom: 0;
      border: 1px solid var(--color-gray-200);
      border-radius: var(--rounded-xl);
      background: var(--color-background-200);
      transition:
        translate 350ms var(--timing),
        box-shadow 350ms var(--timing);
    }

    &:after {
      width: calc(100% - var(--size-6));
    }

    &:before {
      width: calc(100% - var(--size-12));
    }

    &[data-stack-count='1'],
    &[data-stack-count='2'] {
      &:after {
        translate: 0 var(--stack-offset);
      }
    }

    /* Only the bottom stack should have the shadow */
    &[data-stack-count='1']:after {
      box-shadow: var(--shadow);
    }

    /* Re-position the shadow when there is another stack */
    &[data-stack-count='2'] {
      &:after {
        box-shadow: none;
      }
    }

    &[data-stack-count='2'] {
      &:before {
        translate: 0 calc(var(--stack-offset) * 2);
        box-shadow: var(--shadow);
      }
    }
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
