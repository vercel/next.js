import { cookies } from 'next/headers'

export const unstable_instant = { level: 'experimental-error' }

export default async function Slot2bPage() {
  await cookies()
  return <p>Slot 2b — blocks with cookies()</p>
}
