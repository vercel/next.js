import { ImageResponse } from 'next/og'

export default async function icon({ params, id }) {
  const { size } = await params
  const iconId = await id
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
        Apple {size} {iconId}
      </div>
    )
  )
}
