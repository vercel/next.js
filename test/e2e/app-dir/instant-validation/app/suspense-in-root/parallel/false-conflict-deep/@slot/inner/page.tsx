import { cookies } from 'next/headers'

export const unstable_instant = false

export default async function SlotInnerPage() {
  await cookies()
  return (
    <p style={{ color: 'blue' }}>
      Slot inner page with unstable_instant = false, allowed to block
    </p>
  )
}
