'use client'

export function Button() {
  return (
    <button
      onClick={() => {
        throw new Error('oof')
      }}
    >
      click me!
    </button>
  )
}
