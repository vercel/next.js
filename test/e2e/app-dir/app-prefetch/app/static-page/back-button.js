'use client'

export function BackButton() {
  return (
    <button
      type="button"
      id="go-back"
      onClick={() => {
        window.history.back()
      }}
    >
      Go back
    </button>
  )
}
