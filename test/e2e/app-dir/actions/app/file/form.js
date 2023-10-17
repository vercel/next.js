'use client'

export default function Form({ action }) {
  const submit = (n) => action('a'.repeat(1024 * 1024 * n))
  return (
    <>
      <button id="size-1mb" onClick={() => submit(1)}>
        1mb
      </button>
      <button id="size-2mb" onClick={() => submit(2)}>
        2mb
      </button>
    </>
  )
}
