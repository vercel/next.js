export type ImageResponseFormat = 'png' | 'webp' | 'avif' | 'jpeg' | 'jpg'

/**
 * Returns the MIME content-type corresponding to the specified ImageResponse format.
 */
export function getImageFormatContentType(
  format?: ImageResponseFormat
): string {
  switch (format) {
    case 'webp':
      return 'image/webp'
    case 'avif':
      return 'image/avif'
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg'
    case 'png':
    default:
      return 'image/png'
  }
}

function toBuffer(buffer: ArrayBuffer | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(buffer)) {
    return buffer
  }
  if (buffer instanceof ArrayBuffer) {
    return Buffer.from(buffer)
  }
  return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

let _sharp: typeof import('sharp').default | undefined

async function getSharp(
  format: string
): Promise<typeof import('sharp').default> {
  if (_sharp) {
    return _sharp
  }
  try {
    const mod = await import('sharp')
    _sharp = ((mod as any).default || mod) as typeof import('sharp').default
    return _sharp
  } catch (e: unknown) {
    throw new Error(
      `ImageResponse format "${format}" requires "sharp" to be installed. Please run "npm install sharp" to install it.`
    )
  }
}

/**
 * Transforms an image buffer (PNG rendered from `@vercel/og`) to the target format (WebP, AVIF, JPEG, etc.)
 * using `sharp`.
 */
export async function transformImageFormat(
  buffer: ArrayBuffer | Buffer | Uint8Array,
  format: ImageResponseFormat,
  quality?: number
): Promise<Buffer> {
  if (format === 'png' && quality === undefined) {
    return toBuffer(buffer)
  }

  const sharp = await getSharp(format)
  const inputBuffer = toBuffer(buffer)
  let transformer = sharp(inputBuffer)

  const qualityOption = quality !== undefined ? { quality } : undefined

  switch (format) {
    case 'webp':
      transformer = transformer.webp(qualityOption)
      break
    case 'avif':
      transformer = transformer.avif(qualityOption)
      break
    case 'jpeg':
    case 'jpg':
      transformer = transformer.jpeg(qualityOption)
      break
    case 'png':
      transformer = transformer.png(qualityOption)
      break
    default:
      throw new Error(
        `Unsupported image format "${format}" for ImageResponse. Supported formats are: "png", "webp", "avif", "jpeg", "jpg".`
      )
  }

  return transformer.toBuffer()
}
