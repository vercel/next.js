import { ImageResponse } from 'next/og'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const font = await fs.promises.readFile(
    // We need to use process.cwd() instead of import.meta.url for nft tracing purpose
    path.join(process.cwd(), 'assets/typewr__.ttf')
  )
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
