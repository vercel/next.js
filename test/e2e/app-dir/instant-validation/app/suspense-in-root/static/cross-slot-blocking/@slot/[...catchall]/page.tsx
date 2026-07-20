import { cookies } from 'next/headers'

// @slot has NO instant config but calls cookies() without Suspense.
// This blocks the navigation, violating the instant config that's
// deep in the children slot (inner/deep/page.tsx) behind a second
// fork point. The cause should fall back to the root config.
export default async function CatchallSlotPage() {
  await cookies()
  return <p>Slot catchall page — blocks with cookies(), no config</p>
}
