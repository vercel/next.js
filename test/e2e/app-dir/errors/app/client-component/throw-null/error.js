'use client'

export default function ErrorBoundary({ error }) {
  return <p id="error-boundary-message">{`An error occurred: ${error}`}</p>
}
