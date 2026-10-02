'use client'

export function ErrorTrigger() {
  return (
    <button
      type="button"
      data-testid="trigger-error"
      onClick={() => {
        // Throw asynchronously so the error is reported to the dev overlay's
        // issue list (the badge toast) WITHOUT auto-opening the overlay. A
        // render-time throw would be caught by AppDevOverlayErrorBoundary, which
        // calls openErrorOverlay() and auto-opens the overlay, preempting the
        // toast-click path these tests exercise.
        setTimeout(() => {
          throw new Error('Instant nav devtools test error')
        })
      }}
    >
      Trigger error
    </button>
  )
}
