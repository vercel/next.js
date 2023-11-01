import { ImageResponse } from 'next/og'

export const contentType = 'image/png'

export default function appleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 88,
          background: '#fff',
          color: '#000',
        }}
      >
        Apple Icon
      </div>
    )
  )
}
