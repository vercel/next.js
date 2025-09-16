'use client'

function throwError() {
  throw new Error('Client component error in app router')
}

function callError() {
  throwError()
}

export default function ClientErrorPage() {
  return (
    <div>
      <button
        id="error-button"
        onClick={() => {
          callError()
        }}
      >
        Throw Error
      </button>
    </div>
  )
}
