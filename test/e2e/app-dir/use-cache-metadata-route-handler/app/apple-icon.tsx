import { ImageResponse } from 'next/og'

export const contentType = 'image/png'
export const size = { width: 180, height: 180 }

export default function appleIcon() {
  return new ImageResponse(<AsyncAppleIcon />)
}

async function AsyncAppleIcon() {
  'use cache'

  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  return (
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
      {data}
    </div>
  )
}
