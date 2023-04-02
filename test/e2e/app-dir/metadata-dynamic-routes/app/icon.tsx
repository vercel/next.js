import { ImageResponse } from 'next/server'

export const contentType = 'image/png'
export const size = { width: 512, height: 512 }

export function generateImageMetadata({ params }) {
  const big = params.size === 'big'
  return [0, 1, 2].map((i) => {
    return {
      size: {
        width: big === true ? 1200 : 600,
        height: big === true ? 630 : 315,
      },
      alt: 'icon',
      contentType: 'image/png',
      id: i,
    }
  })
}

export default function icon({ params, id }) {
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
        Icon
      </div>
    )
  )
}
