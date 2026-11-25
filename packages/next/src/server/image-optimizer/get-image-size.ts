import imageSizeOf from 'next/dist/compiled/image-size'

export async function getImageSize(buffer: Buffer): Promise<{
  width?: number
  height?: number
}> {
  const { width, height } = imageSizeOf(buffer)
  return { width, height }
}
