import { connection } from 'next/server'

// Mirrors a request-time footer: a genuinely dynamic boundary that
// postpones, making the route Partial Prerender and storing a postponed
// state alongside the prerendered HTML. Its content is large enough that
// the runtime resume outlines parts of it into NEW hidden segments
// (allocated from the stored nextSegmentId counter).
export async function DynamicFooter() {
  await connection()

  const rows = Array.from({ length: 600 }, (_, i) => `footer-row-${i}`)

  return (
    <footer id="dynamic-footer">
      <p>rendered at request time</p>
      <ul>
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </footer>
  )
}
