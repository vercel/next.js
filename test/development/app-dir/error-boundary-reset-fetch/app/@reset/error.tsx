'use client'

export default function ResetErrorPage({ reset }) {
  return (
    <button id="reset" onClick={() => reset()}>
      Reset error (@reset/error.tsx)
    </button>
  )
}
