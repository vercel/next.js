'use client'
export default function Page() {
  return (
    <>
      <button
        onClick={async () => {
          const response = await fetch('/foo', { method: 'OPTIONS' })
          console.log(await response.json())
        }}
      >
        Trigger Options Request (route)
      </button>
      <button
        onClick={async () => {
          const response = await fetch('/foo-page', { method: 'OPTIONS' })
          console.log(await response.text())
        }}
      >
        Trigger Options Request (/app page)
      </button>
      <button
        onClick={async () => {
          const response = await fetch('/bar-page', { method: 'OPTIONS' })
          console.log(await response.text())
        }}
      >
        Trigger Options Request (/pages page)
      </button>
    </>
  )
}
