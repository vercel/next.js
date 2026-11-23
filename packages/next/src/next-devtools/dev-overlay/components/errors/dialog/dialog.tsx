import { Dialog } from '../../dialog/dialog'

function animateContentResize(frame: HTMLDivElement) {
  const content = frame.querySelector('[data-nextjs-dialog-content]')
  const panel = frame.closest('[data-nextjs-dialog-root]')
  if (!content || !panel) return

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let animation: Animation | undefined
  let lastHeight: number | undefined
  let lastWidth: number | undefined

  // Observe the natural content size, not the frame we're animating.
  const observer = new ResizeObserver(([{ contentRect }]) => {
    const from =
      animation?.playState === 'running' ? frame.offsetHeight : lastHeight
    animation?.cancel()
    const to = frame.offsetHeight
    const sameWidth = lastWidth === contentRect.width
    lastWidth = contentRect.width
    lastHeight = to

    // Opening and closing already have their own fade. Only resize a panel
    // that's fully open, and let viewport changes lay out normally.
    if (
      from !== undefined &&
      from !== to &&
      sameWidth &&
      !reducedMotion.matches &&
      getComputedStyle(panel).opacity === '1'
    ) {
      animation = frame.animate(
        [{ height: `${from}px` }, { height: `${to}px` }],
        { duration: 160, easing: 'ease-out' }
      )
    }
  })
  observer.observe(content)
  return () => {
    observer.disconnect()
    animation?.cancel()
  }
}

type ErrorOverlayDialogProps = {
  children?: React.ReactNode
  onClose?: () => void
} & React.HTMLAttributes<HTMLDivElement>

export function ErrorOverlayDialog({
  children,
  onClose,
  ...props
}: ErrorOverlayDialogProps) {
  return (
    <div className="error-overlay-dialog-container" ref={animateContentResize}>
      <Dialog
        aria-labelledby="nextjs__container_errors_label"
        aria-describedby="nextjs__container_errors_desc"
        className="error-overlay-dialog-scroll"
        onClose={onClose}
        {...props}
      >
        {children}
      </Dialog>
    </div>
  )
}

export const DIALOG_STYLES = `
  .error-overlay-dialog-container {
    display: flex;
    flex-direction: column;
    background: var(--color-background-100);
    background-clip: padding-box;
    border-radius: var(--next-dialog-radius);
    box-shadow: var(--shadow-menu);
    position: relative;
    overflow: hidden;
  }

  .error-overlay-dialog-scroll {
    overflow-y: auto;
    scrollbar-gutter: stable;
    height: 100%;
  }
`
