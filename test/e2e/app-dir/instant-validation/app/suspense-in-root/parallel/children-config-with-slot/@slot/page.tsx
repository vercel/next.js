import { cookies } from 'next/headers'

export default async function SlotPage() {
  await cookies()
  return (
    <p style={{ color: 'blue' }}>
      This is a parallel slot page that awaits cookies() without Suspense
    </p>
  )
}
