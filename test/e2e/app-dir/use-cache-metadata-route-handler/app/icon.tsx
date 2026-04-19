import { ImageResponse } from 'next/og'
import { setTimeout } from 'timers/promises'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

async function fetchIconLetter() {
  'use cache'

  // Simulate I/O
  await setTimeout(100)

  return 'N'
}

export default async function Icon() {
  const letter = await fetchIconLetter()

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: 'black',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
        }}
      >
        {letter}
      </div>
    ),
    { ...size }
  )
}
