'use client'

export default function SlotError({ error }: { error: Error }) {
  return <div id="slot-error">Slot Error: {error.message}</div>
}
