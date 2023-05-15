import * as React from 'react'
import { clsx } from '../../helpers/clsx'
import { CloseIcon } from '../../icons'
import { noop as css } from '../../helpers/noop-template'

export type DialogHeaderProps = {
  close?: () => void
  className?: string
  children: React.ReactNode
}

export function DialogHeader({
  children,
  className,
  close,
}: DialogHeaderProps) {
  const buttonClose = React.useRef<HTMLButtonElement | null>(null)

  React.useEffect(() => {
    if (buttonClose.current == null) {
      return
    }

    const root = buttonClose.current.getRootNode()
    const d = self.document

    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (root instanceof ShadowRoot) {
          const a = root.activeElement
          if (a && a !== buttonClose.current && a instanceof HTMLElement) {
            a.blur()
            return
          }
        }

        if (close) {
          close()
        }
      }
    }

    root.addEventListener('keydown', handler as EventListener)
    if (root !== d) {
      d.addEventListener('keydown', handler)
    }
    return function () {
      root.removeEventListener('keydown', handler as EventListener)
      if (root !== d) {
        d.removeEventListener('keydown', handler)
      }
    }
  }, [close, buttonClose])

  return (
    <div data-nextjs-dialog-header className={clsx('dialog-header', className)}>
      {children}
      <div className="filler">&nbsp;</div>
      {close ? (
        <button
          ref={buttonClose}
          type="button"
          onClick={close}
          aria-label="Close"
          className="close-button"
        >
          <span aria-hidden="true">
            <CloseIcon />
          </span>
        </button>
      ) : null}
    </div>
  )
}

export const styles = css`
  .dialog-content > .dialog-header {
    flex-shrink: 0;
  }

  .dialog-header {
    --local-padding: var(--size-gap-big);

    display: flex;
    flex-direction: row;
    align-content: center;
    align-items: center;
    justify-content: space-between;

    height: calc(
      var(--size-icon) + var(--local-padding) * 2 + var(--border) * 2
    );

    background-color: var(--color-bg-secondary);
  }

  .dialog-header > * {
    height: 100%;
    padding: var(--local-padding);

    border-bottom: var(--border);
  }

  .dialog-header > *:not(:first-child):not(.close-button) {
    border-left: var(--border-half);
  }

  .dialog-header
    > *:not(:last-child):not(:nth-last-child(2):before(.close-button)) {
    border-right: var(--border-half);
  }

  .dialog-header > .filler {
    display: flex;
    flex: 1 0 auto;
    flex-grow: 1;
    align-self: stretch;
    padding-left: 0;
    padding-right: 0;
  }

  .dialog-header > .filler > div {
    display: flex;
    flex: 1 0 auto;
    flex-grow: 1;
    align-self: stretch;
    padding: var(--local-padding);
    padding-left: 0;
    padding-right: 0;
    border-bottom: var(--border);
  }

  .dialog-header > button:last-of-type {
    border: none;
    border-bottom: var(--border);

    background-color: transparent;
    appearance: none;
  }

  .dialog-header > button:last-of-type > span {
    display: flex;
    opacity: 0.4;
    transition: opacity 0.25s ease;
  }

  .dialog-header > button:last-of-type:hover > span {
    opacity: 0.7;
  }
`
