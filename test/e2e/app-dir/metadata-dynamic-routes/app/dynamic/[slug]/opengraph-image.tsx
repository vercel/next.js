import { ImageResponse } from '@vercel/og'

export const alt = 'Open Graph'

export default function og({ params }) {
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
        Dynamic Open Graph - {params.slug}
      </div>
    )
  )
}
