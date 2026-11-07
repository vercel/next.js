import { ImageResponse } from 'next/og'

export default async function icon({ params }) {
  const { id } = await params
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 500,
          background: '#fff',
          color: '#000',
        }}
      >
        P{id}
      </div>
    )
  )
}
