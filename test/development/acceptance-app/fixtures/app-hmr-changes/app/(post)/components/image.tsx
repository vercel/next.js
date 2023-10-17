import sizeOf from 'image-size'
import { join } from 'path'
import { readFile } from 'fs/promises'
import NextImage from 'next/image'

export async function Image({ src, alt = null, width = null, height = null }) {
  if (!src.startsWith('data:') && (width === null || height === null)) {
    let imageBuffer = null

    if (src.startsWith('http')) {
      imageBuffer = Buffer.from(
        await fetch(src).then((res) => res.arrayBuffer())
      )
    } else {
      imageBuffer = await readFile(
        new URL(join(import.meta.url, '..', '..', '..', '..', 'public', src))
          .pathname
      )
    }

    ;({ width, height } = sizeOf(imageBuffer))
  }

  return (
    <span className="my-5 flex flex-col items-center">
      {src.startsWith('data:') ? (
        <img src={src} alt={alt} />
      ) : (
        <NextImage width={width} height={height} alt={alt} src={src} />
      )}

      {alt && (
        <span className="block font-mono text-xs mt-5 text-center">{alt}</span>
      )}
    </span>
  )
}
