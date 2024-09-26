'use client'

export function Client({ onClick }) {
  return (
    <button
      onClick={() => {
        onClick()
      }}
    >
      click
    </button>
  )
}
