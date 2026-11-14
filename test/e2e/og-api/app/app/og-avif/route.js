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
          backgroundColor: '#10b981',
          color: '#ffffff',
          fontSize: 32,
        }}
      >
        AVIF Social Preview
      </div>
    ),
    {
      width: 1200,
      height: 630,
      format: 'avif',
      quality: 75,
    }
  )
}
