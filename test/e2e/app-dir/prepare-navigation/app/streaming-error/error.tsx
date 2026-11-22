'use client'

export default function ErrorBoundary({ error }: { error: Error }) {
  return <p id="streaming-error">{`Error: ${error.message}`}</p>
}
