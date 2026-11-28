'use client'

export function ReplaceStateButton({ searchParams }: { searchParams: string }) {
  return (
    <button
      id="replace-state-button"
      onClick={() => {
        const url = new URL(window.location.href)
        url.search = searchParams
        history.replaceState(null, '', url.toString())
      }}
    >
      ReplaceState
    </button>
  )
}
