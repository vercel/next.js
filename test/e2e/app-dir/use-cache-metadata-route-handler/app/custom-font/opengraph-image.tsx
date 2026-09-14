import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Load the font once at module scope with a top-level await, using the
// documented `readFile` API. Reading it inside the handler instead would be
// uncached I/O during the prerender, which Cache Components treats as dynamic,
// opting the route out of static generation.
const font = await readFile(join(process.cwd(), 'assets/typewr__.ttf'))

export default async function Image() {
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
          fontFamily: 'Typewriter',
          background: '#fff',
          color: '#000',
        }}
      >
        Typewriter
      </div>
    ),
    { ...size, fonts: [{ name: 'Typewriter', data: font, style: 'normal' }] }
  )
}
