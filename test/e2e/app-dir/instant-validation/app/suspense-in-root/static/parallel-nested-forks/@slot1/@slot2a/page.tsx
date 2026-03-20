import { cookies } from 'next/headers'

export const unstable_instant = { prefetch: 'static' }

export default async function Slot2aPage() {
  await cookies()
  return <p>Slot 2a — blocks with cookies()</p>
}
