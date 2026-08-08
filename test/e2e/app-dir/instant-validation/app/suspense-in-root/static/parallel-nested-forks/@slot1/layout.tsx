import { ReactNode } from 'react'

// This layout has no children slot — only named slots slot2a and slot2b.
export default function Slot1Layout({
  slot2a,
  slot2b,
}: {
  slot2a: ReactNode
  slot2b: ReactNode
}) {
  return (
    <div>
      <div style={{ border: '1px solid green', padding: '0.5em' }}>
        {slot2a}
      </div>
      <div style={{ border: '1px solid red', padding: '0.5em' }}>{slot2b}</div>
    </div>
  )
}
