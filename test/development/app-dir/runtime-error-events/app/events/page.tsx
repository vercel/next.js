'use client'
export default function Page() {
  return (
    <>
      <p id="content">Usable preview</p>
      <button
        id="event"
        onClick={() => {
          throw new Error('event failed')
        }}
      >
        Event
      </button>
      <button
        id="rejection"
        onClick={() => {
          void Promise.reject(new Error('rejection failed'))
        }}
      >
        Rejection
      </button>
    </>
  )
}
