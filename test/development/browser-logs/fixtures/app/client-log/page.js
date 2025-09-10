'use client'

export default function ClientLogPage() {
  return (
    <div>
      <button
        id="log-button"
        onClick={() => {
          console.log('Client component log from app router')
        }}
      >
        test button
      </button>
    </div>
  )
}
