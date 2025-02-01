'use client'

export default function Page() {
  return (
    <button
      onClick={() => {
        // Create an ErrorEvent with only a message
        const errorEvent = new ErrorEvent('error', {
          message: 'dummy error message', // Message for the event
          // Omit the `error` property to ensure it is not included
        })

        // Dispatch the event
        window.dispatchEvent(errorEvent)
      }}
    >
      click to trigger error event
    </button>
  )
}
