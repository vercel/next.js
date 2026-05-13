import { cookies } from 'next/headers'

export default async function IndexSlot() {
  await cookies()
  return (
    <p style={{ color: 'blue' }}>
      This is a parallel layout slot that awaits cookies() without Suspense
    </p>
  )
}
