import { connection } from 'next/server'

import Counter from './counter'

export default async function BoundaryPage() {
  // Nonce-based CSP requires dynamic rendering.
  await connection()

  // Suspend long enough that React streams the `loading.js` fallback - and with
  // it the segment's boundary scripts - into the initial HTML.
  await new Promise((resolve) => setTimeout(resolve, 1000))

  return (
    <main>
      <p id="page">page segment rendered</p>
      <Counter />
    </main>
  )
}
