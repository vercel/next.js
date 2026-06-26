import { ImageResponse } from 'next/og'

export const alt = 'Test OpenGraph Image'
export const size = {
  width: 800,
  height: 600,
}

export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: 'linear-gradient(90deg, #000 0%, #111 100%)',
          color: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          textAlign: 'center',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        OpenGraph Test Image
      </div>
    ),
    {
      ...size,
    }
  )
}
