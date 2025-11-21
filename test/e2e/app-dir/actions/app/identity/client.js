'use client'

export function Client({ foo, b }) {
  return (
    <button
      onClick={() => {
        foo(b)
      }}
    >
      Trigger
    </button>
  )
}
