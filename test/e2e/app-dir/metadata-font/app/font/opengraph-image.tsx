import { ImageResponse } from 'next/og'

export const contentType = 'image/png'

export default async function og() {
  const font = await fetch(
    new URL('../../assets/typewr__.ttf', import.meta.url)
  ).then((res) => res.arrayBuffer())
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
        Typewriter og
      </div>
    ),
    {
      fonts: [
        {
          name: 'Typewriter',
          data: font,
          style: 'normal',
        },
      ],
    }
  )
}

export const runtime = 'edge'
