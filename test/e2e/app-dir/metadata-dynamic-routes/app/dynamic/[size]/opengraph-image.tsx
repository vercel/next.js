import { ImageResponse } from 'next/server'

export function generateImageData({ params }) {
  const big = params.size === 'big'
  return [0, 1, 2].map((i) => {
    return {
      size: {
        width: big === true ? 1200 : 600,
        height: big === true ? 630 : 315,
      },
      alt: 'Open Graph',
      contentType: 'image/png',
      id: i,
    }
  })
}

export default function og({ params }) {
  const big = params.size === 'big'
  const background = big ? 'orange' : '#000'
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
        }}
      >
        <div
          style={{
            width: 200,
            height: 200,
            background,
          }}
        />
      </div>
    ),
    {
      width: big === true ? 1200 : 600,
      height: big === true ? 630 : 315,
    }
  )
}
