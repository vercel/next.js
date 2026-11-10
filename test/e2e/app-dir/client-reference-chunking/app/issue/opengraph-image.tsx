import { ImageResponse } from 'next/og'

// Image metadata
export const size = {
  width: 516,
  height: 271,
}

export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 48,
          background: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Issue page opengraph image
      </div>
    ),
    {
      ...size,
    }
  )
}
