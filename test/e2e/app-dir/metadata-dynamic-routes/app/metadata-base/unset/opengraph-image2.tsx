import { ImageResponse } from 'next/og'

export const alt = 'Open Graph'

export async function generateImageMetadata() {
  return [
    {
      contentType: 'image/png',
      size: { width: 1200, height: 600 },
      id: 100,
    },
    {
      contentType: 'image/png',
      size: { width: 1200, height: 600 },
      id: 101,
    },
  ]
}

export default function og() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 128,
          background: 'lavender',
        }}
      >
        Open Graph
      </div>
    )
  )
}
