import { DialogHeader } from '../../dialog/dialog-header'
import { noop as css } from '../../../helpers/noop-template'

type ErrorOverlayDialogHeaderProps = {
  children?: React.ReactNode
}

export function ErrorOverlayDialogHeader({
  children,
}: ErrorOverlayDialogHeaderProps) {
  return (
    <DialogHeader className="nextjs-container-errors-header">
      {children}
    </DialogHeader>
  )
}

export const DIALOG_HEADER_STYLES = css`
  .nextjs-container-errors-header {
    position: relative;
  }
  .nextjs-container-errors-header > h1 {
    font-size: var(--size-font-big);
    line-height: var(--size-font-bigger);
    font-weight: bold;
    margin: calc(var(--size-gap-double) * 1.5) 0;
    color: var(--color-title-h1);
  }
  .nextjs-container-errors-header small {
    font-size: var(--size-font-small);
    color: var(--color-accents-1);
    margin-left: var(--size-gap-double);
  }
  .nextjs-container-errors-header small > span {
    font-family: var(--font-stack-monospace);
  }
  .nextjs-container-errors-header > div > small {
    margin: 0;
    margin-top: var(--size-gap-half);
  }
  .nextjs-container-errors-header > p > a {
    color: inherit;
    font-weight: bold;
  }
  .nextjs-container-errors-header
    > .nextjs-container-build-error-version-status {
    position: absolute;
    top: var(--size-4);
    right: var(--size-4);
  }
`
