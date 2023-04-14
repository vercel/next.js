import { ImageResponse } from 'next/server'

export async function generateImageMetadata({ params, searchParams }) {
  const smallSize = searchParams.query === '1' ? 48 : 12
  return [
    {
      contentType: 'image/png',
      size: { width: smallSize, height: smallSize },
      id: 'small',
    },
    {
      contentType: 'image/png',
      size: { width: 72, height: 72 },
      id: 'medium',
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
          background: '#fff',
          color: '#000',
        }}
      >
        Icon {params.size} {id}
      </div>
    )
  )
}
