'use client'

export function ParseErrorDemo() {
  return (
    <>
      <button
        id="load-parse-error"
        onClick={() => {
          if (typeof window !== 'undefined') {
            return import('./parse-error-target')
          }
        }}
      >
        parse target
      </button>
      <p id="parse-error-idle">not parsed</p>
    </>
  )
}
