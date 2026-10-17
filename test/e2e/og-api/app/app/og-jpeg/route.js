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
          backgroundColor: '#f59e0b',
          color: '#ffffff',
          fontSize: 32,
        }}
      >
        JPEG Social Preview
      </div>
    ),
    {
      width: 1200,
      height: 630,
      format: 'jpeg',
      quality: 85,
    }
  )
}
