'use client'

export default function Page() {
  return (
    <button
      onClick={() => {
        console.error('trigger an console <%s>', 'error')
      }}
    >
      click to error
    </button>
  )
}
