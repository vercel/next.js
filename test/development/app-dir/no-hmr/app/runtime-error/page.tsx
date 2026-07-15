'use client'

export default function Page() {
  return (
    <button
      id="trigger-runtime-error"
      onClick={() => {
        throw new Error('no-hmr runtime error')
      }}
    >
      trigger
    </button>
  )
}
