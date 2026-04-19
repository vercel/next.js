// This file should be ignored
import { ImageResponse } from 'next/og'

export default function favicon() {
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
        Favicon
      </div>
    )
  )
}
