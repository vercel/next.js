import { ImageResponse } from 'next/server'

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
          color: '#fff',
          background: '#000',
        }}
      >
        group route og
      </div>
    )
  )
}
