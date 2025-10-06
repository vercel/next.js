'use client'
export default function Page() {
  return (
    <>
      <button
        onClick={async () => {
          const response = await fetch('/app-route', { method: 'OPTIONS' })
          console.log(await response.json())
        }}
      >
        Trigger Options Request (/app route)
      </button>
      <button
        onClick={async () => {
          const response = await fetch('/app-page', { method: 'OPTIONS' })
          console.log(await response.text())
        }}
      >
        Trigger Options Request (/app page)
      </button>
      <button
        onClick={async () => {
          const response = await fetch('/pages-page', { method: 'OPTIONS' })
          console.log(await response.text())
        }}
      >
        Trigger Options Request (/pages page)
      </button>
      <button
        onClick={async () => {
          const response = await fetch('/api/pages-api-handler', {
            method: 'OPTIONS',
          })
          console.log(await response.text())
        }}
      >
        Trigger Options Request (/pages API route)
      </button>
    </>
  )
}
