import { ImageResponse } from 'next/og'

// without id
export async function generateImageMetadata({ params }) {
  return [
    {
      contentType: 'image/png',
      size: { width: 48, height: 48 },
    },
    {
      contentType: 'image/png',
      size: { width: 64, height: 64 },
    },
  ]
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
          background: '#000',
          color: '#fafafa',
        }}
      >
        Apple {params.size} {id}
      </div>
    )
  )
}
