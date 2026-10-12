'use client'

export function UpdateButton({ action }: { action: () => Promise<void> }) {
  return (
    <button id="update" onClick={() => action()}>
      Update
    </button>
  )
}
