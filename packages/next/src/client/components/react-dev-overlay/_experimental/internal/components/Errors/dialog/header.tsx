import { DialogHeader } from '../../Dialog/DialogHeader'
import { noop as css } from '../../../helpers/noop-template'

type ErrorOverlayDialogHeaderProps = {
  children?: React.ReactNode
  isTurbopack?: boolean
}

export function ErrorOverlayDialogHeader({
  children,
  isTurbopack,
}: ErrorOverlayDialogHeaderProps) {
  return (
    <DialogHeader
      className={`nextjs-container-errors-header ${
        isTurbopack
          ? 'nextjs-error-overlay-dialog-header-turbopack-background'
          : ''
      }`}
    >
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

  .nextjs-error-overlay-dialog-header-turbopack-background {
    background-image: linear-gradient(
      10deg,
      var(--color-background-100) 60%,
      var(--color-turbopack-background-red) 75%,
      var(--color-turbopack-background-blue) 100%
    );
  }
`
