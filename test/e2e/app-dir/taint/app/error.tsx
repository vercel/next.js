'use client'

export default function ErrorComponent({ error }) {
  return <h1 id="error-component">{error.message}</h1>
}
