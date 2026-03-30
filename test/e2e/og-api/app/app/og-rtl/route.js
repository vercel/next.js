import { ImageResponse } from 'next/og'

export async function GET() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        backgroundColor: 'white',
        direction: 'rtl',
      }}
    >
      <p style={{ fontSize: 48 }}>هل تعتقد أن الاتفاق</p>
    </div>,
    {
      width: 1200,
      height: 630,
    }
  )
}
