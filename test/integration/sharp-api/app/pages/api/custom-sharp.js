import sharp from 'sharp'

export default async function handler(req, res) {
  const roundedCorners = Buffer.from(
    '<svg><rect x="0" y="0" width="200" height="200" rx="50" ry="50"/></svg>'
  )
  const buffer = await sharp(roundedCorners).resize(200, 200).png().toBuffer()

  res.setHeader('content-type', 'image/png')
  res.setHeader('content-length', buffer.byteLength)
  res.end(buffer)
}
