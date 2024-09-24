import { ImageResponse } from 'next/og'

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
