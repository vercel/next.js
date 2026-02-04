'use client' // Error components must be Client Components

export default function Error({ error, reset }) {
  return (
    <div>
      <h2 id="error-text">{error.message}</h2>
      <button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
      >
        Try again
      </button>
    </div>
  )
}
