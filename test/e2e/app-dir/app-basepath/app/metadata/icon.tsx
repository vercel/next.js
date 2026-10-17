import { ImageResponse } from 'next/og'

export const contentType = 'image/png'
export const size = { width: 64, height: 64 }

export default function icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
          background: '#fff',
          color: '#000',
        }}
      >
        Icon
      </div>
    )
  )
}
