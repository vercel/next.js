'use client'

export default function ConsoleRuntimeErrorPage() {
  return (
    <main>
      <button
        id="console-error"
        onClick={() => {
          console.error(new Error('Test console error'))
        }}
      >
        Trigger console error
      </button>
      <p id="console-page-content">Page remains rendered</p>
    </main>
  )
}
