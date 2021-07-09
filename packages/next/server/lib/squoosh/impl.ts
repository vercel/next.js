import sharp from 'sharp'

export async function decodeBuffer(
  buffer: Buffer
): Promise<{ width?: number; height?: number }> {
  const { width, height } = await sharp(buffer).metadata()
  return { width, height }
}

export async function rotate(
  image: Buffer,
  numRotations: number
): Promise<Buffer> {
  return sharp(image)
    .rotate(numRotations * 90)
    .toBuffer()
}

type ResizeOpts = { image: Buffer } & (
  | { width: number; height?: never }
  | { height: number; width?: never }
)

export async function resize({ image, width, height }: ResizeOpts) {
  return sharp(image).resize(width, height).toBuffer()
}

export async function encodeJpeg(
  image: Buffer,
  { quality }: { quality: number }
): Promise<Buffer> {
  return sharp(image).jpeg({ quality }).toBuffer()
}

export async function encodeWebp(
  image: Buffer,
  { quality }: { quality: number }
): Promise<Buffer> {
  return sharp(image).webp({ quality }).toBuffer()
}

export async function encodePng(image: Buffer): Promise<Buffer | Uint8Array> {
  return sharp(image).png().toBuffer()
}
