import { cookies } from 'next/headers'

export default async function DefaultSlot() {
  await cookies()
  return (
    <p style={{ color: 'green' }}>
      This is a default parallel slot that awaits cookies() without Suspense
    </p>
  )
}
