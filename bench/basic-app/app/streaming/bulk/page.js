import React from 'react'

export const dynamic = 'force-dynamic'

const ROWS = 2500
const PAYLOAD = 'x'.repeat(384)
const DATA = Array.from(
  { length: ROWS },
  (_, index) => `row-${index}-${PAYLOAD}`
)

export default function Page() {
  return (
    <main>
      <h1>stream-bulk</h1>
      {DATA.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </main>
  )
}
