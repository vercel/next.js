import { setImmediate } from 'node:timers/promises'
import { ImageResponse } from 'next/og'

export const contentType = 'image/png'
export const size = { width: 320, height: 320 }

export default function Icon() {
  return new ImageResponse(<ImmediateIcon />, size)
}

async function ImmediateIcon() {
  await setImmediate()

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        width: '100%',
        height: '100%',
        background: 'white',
      }}
    >
      {Array.from({ length: 100 }, (_, index) => (
        <div
          key={index}
          style={{ display: 'flex', width: 32, height: 32, fontSize: 16 }}
        >
          {index}
        </div>
      ))}
    </div>
  )
}
