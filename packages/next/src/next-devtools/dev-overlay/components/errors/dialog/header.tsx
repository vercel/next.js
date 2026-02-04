import { DialogHeader } from '../../dialog/dialog-header'

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

export const DIALOG_HEADER_STYLES = `
  .nextjs-container-errors-header {
    position: relative;
  }
  .nextjs-container-errors-header > h1 {
    font-size: var(--size-20);
    line-height: var(--size-24);
    font-weight: bold;
    margin: calc(16px * 1.5) 0;
    color: var(--color-title-h1);
  }
  .nextjs-container-errors-header small {
    font-size: var(--size-14);
    color: var(--color-accents-1);
    margin-left: 16px;
  }
  .nextjs-container-errors-header small > span {
    font-family: var(--font-stack-monospace);
  }
  .nextjs-container-errors-header > div > small {
    margin: 0;
    margin-top: 4px;
  }
  .nextjs-container-errors-header > p > a {
    color: inherit;
    font-weight: bold;
  }
  .nextjs-container-errors-header
    > .nextjs-container-build-error-version-status {
    position: absolute;
    top: 16px;
    right: 16px;
  }
`
