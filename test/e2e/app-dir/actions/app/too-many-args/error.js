'use client'

export default function Error({ error }) {
  return (
    <div>
      <h2 id="error-text">
        {error.name}: {error.message}
      </h2>
    </div>
  )
}
