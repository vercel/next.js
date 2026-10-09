'use client'

export default function Page() {
  return (
    <button
      onClick={() => {
        new Worker(new URL('./worker.js', import.meta.url))
      }}
    >
      start worker
    </button>
  )
}
