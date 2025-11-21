import { ImageResponse } from 'next/og'

export async function generateImageMetadata({ params }) {
  return [
    {
      contentType: 'image/png',
      size: { width: 48, height: 48 },
      id: '0',
    },
    {
      contentType: 'image/png',
      size: { width: 64, height: 64 },
      id: '1',
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
