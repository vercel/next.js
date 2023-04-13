import { ImageResponse } from 'next/server'

// export const contentType = 'image/png'
// export const size = { width: 512, height: 512 }

export async function generateImageMetadata({ params }) {
  return [
    {
      contentType: 'image/png',
      size: { width: 48, height: 48 },
    },
    {
      contentType: 'image/png',
      size: { width: 72, height: 72 },
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
        Icon {id}
      </div>
    )
  )
}
