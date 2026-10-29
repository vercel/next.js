import { Suspense } from 'react'
import { connection } from 'next/server'

// The outer boundary's content is larger than React's progressive chunk size,
// so React writes it as a separate segment that a script reveals. The inner
// hole sits inside that segment.
const paragraphs = Array.from(
  { length: 40 },
  (_, i) => `Paragraph ${i}: ${'static text '.repeat(40)}`
)

export default function Page() {
  return (
    <main>
      <h1 id="heading">Nested hole in a large segment</h1>
      <Suspense fallback={<p id="fallback-outer">Loading outer…</p>}>
        <section>
          <p id="static-outer">Outer content</p>
          {paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
          <Suspense fallback={<p id="fallback-inner">Loading inner…</p>}>
            <Now />
          </Suspense>
        </section>
      </Suspense>
    </main>
  )
}

async function Now() {
  await connection()
  return <p id="dynamic">Now: {Date.now()}</p>
}
