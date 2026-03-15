import { connection } from 'next/server'

export const unstable_instant = false

// connection() is called directly without a Suspense boundary, and
// unstable_instant = false opts out of prefetching. With Cache Components
// enabled, the route is marked as ƒ (Dynamic). This causes
// prerenderToStream and collectSegmentData to run on EVERY request —
// static generation is happening per-request instead of being cached.
export default async function Page() {
  await connection()
  return (
    <div>
      <h1>Without Suspense</h1>
      <p>Dynamic content (rendered at request time)</p>
    </div>
  )
}
