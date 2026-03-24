import { cookies } from 'next/headers'

export default async function FooSlot() {
  await cookies()
  return (
    <p style={{ color: 'tomato' }}>
      This is a different parallel layout slot that awaits cookies() without
      Suspense
    </p>
  )
}
