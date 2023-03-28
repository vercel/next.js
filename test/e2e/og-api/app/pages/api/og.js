// /pages/api/og.jsx
import { ImageResponse } from '@vercel/og'

export const config = {
  runtime: 'edge',
}

export default function () {
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
        Hello!
      </div>
    )
  )
}
