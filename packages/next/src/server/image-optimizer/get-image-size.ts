import imageSizeOf from 'next/dist/compiled/image-size'

export async function getImageSize(buffer: Buffer): Promise<{
  width?: number
  height?: number
}> {
  try {
    const { width, height } = imageSizeOf(buffer)
    return { width, height }
  } catch (err) {
    // `image-size` only detects an SVG when its root `<svg` element appears
    // near the start of the buffer. Tools like Adobe Illustrator emit an XML
    // declaration, comments and a DOCTYPE with entity declarations before
    // `<svg`, which pushes the root past the detection window and makes
    // `image-size` throw "unsupported file type". These are still valid,
    // measurable SVGs, so retry from the `<svg` root before giving up (#71810).
    const svgStart = buffer.indexOf('<svg')
    if (svgStart > 0) {
      const { width, height } = imageSizeOf(buffer.subarray(svgStart))
      return { width, height }
    }
    throw err
  }
}
