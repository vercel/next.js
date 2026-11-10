'use client'

export default function ErrorBoundary({ error }) {
  return (
    <div>
      <p id="error-boundary-message">{`An error occurred: ${error}`}</p>
      <p id="error-boundary-digest">{`${error?.digest}`}</p>
    </div>
  )
}
