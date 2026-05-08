import { cookies } from 'next/headers'
import { OfflineStatus } from '../offline-status'

export const unstable_instant = false
export const unstable_prefetch = 'force-disabled'

export default async function RequestSensitivePage() {
  const cookieStore = await cookies()
  const session = cookieStore.get('offline-session')?.value ?? 'missing'

  return (
    <>
      <p id="request-sensitive-page">request sensitive session: {session}</p>
      <OfflineStatus />
    </>
  )
}
