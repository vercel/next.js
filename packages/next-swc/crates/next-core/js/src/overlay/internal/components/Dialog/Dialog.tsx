import * as React from 'react'

import { useOnClickOutside } from '../../hooks/use-on-click-outside'
import { clsx } from '../../helpers/clsx'
import { noop as css } from '../../helpers/noop-template'

export type DialogProps = {
  'aria-labelledby': string
  'aria-describedby': string
  onClose?: (e: MouseEvent | TouchEvent) => void
  className?: string
  children?: React.ReactNode | undefined
}

export function Dialog({
  children,
  onClose,
  className,
  ...props
}: DialogProps) {
  const [dialog, setDialog] = React.useState<HTMLDivElement | null>(null)
  const onDialog = React.useCallback(
    (node: React.SetStateAction<HTMLDivElement | null>) => {
      setDialog(node)
    },
    []
  )
  useOnClickOutside(dialog, onClose)

  // Make HTMLElements with `role=link` accessible to be triggered by the
  // keyboard, i.e. [Enter].
  React.useEffect(() => {
    if (dialog == null) {
      return
    }

    const root = dialog.getRootNode()
    // Always true, but we do this for TypeScript:
    if (!(root instanceof ShadowRoot)) {
      return
    }
    const shadowRoot = root

    function handler(e: KeyboardEvent) {
      const el = shadowRoot.activeElement
      if (
        e.key === 'Enter' &&
        el instanceof HTMLElement &&
        el.getAttribute('role') === 'link'
      ) {
        e.preventDefault()
        e.stopPropagation()

        el.click()
      }
    }

    shadowRoot.addEventListener('keydown', handler as EventListener)
    return () =>
      shadowRoot.removeEventListener('keydown', handler as EventListener)
  }, [dialog])

  return (
    <div
      ref={onDialog}
      tabIndex={-1}
      role="dialog"
      aria-labelledby={props['aria-labelledby']}
      aria-describedby={props['aria-describedby']}
      aria-modal="true"
      className={clsx('dialog', className)}
    >
      {children}
    </div>
  )
}

export const styles = css`
  .dialog {
    display: flex;
    flex-direction: column;
    width: 100%;
    margin-right: auto;
    margin-left: auto;
    outline: none;
    background: white;
    border-radius: var(--size-gap);
    box-shadow: 0 var(--size-gap-half) var(--size-gap-double)
      rgba(0, 0, 0, 0.25);
    max-height: calc(100% - 56px);
    overflow-y: hidden;
  }

  @media (max-height: 812px) {
    .dialog-overlay {
      max-height: calc(100% - 15px);
    }
  }

  @media (min-width: 576px) {
    .dialog {
      max-width: 540px;
      box-shadow: 0 var(--size-gap) var(--size-gap-quad) rgba(0, 0, 0, 0.25);
    }
  }

  @media (min-width: 768px) {
    .dialog {
      max-width: 720px;
    }
  }

  @media (min-width: 992px) {
    .dialog {
      max-width: 960px;
    }
  }
`
