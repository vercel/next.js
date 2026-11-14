import { ImageResponse } from 'next/og'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0070f3',
          color: '#ffffff',
          fontSize: 32,
        }}
      >
        WebP Social Preview
      </div>
    ),
    {
      width: 1200,
      height: 630,
      format: 'webp',
      quality: 80,
    }
  )
}
