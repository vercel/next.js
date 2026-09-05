'use client'

export default function RejectionRuntimeErrorPage() {
  return (
    <main>
      <button
        id="rejection-error"
        onClick={() => {
          void Promise.reject(new Error('Test unhandled rejection'))
        }}
      >
        Trigger rejection
      </button>
      <p id="rejection-page-content">Page remains rendered</p>
    </main>
  )
}
