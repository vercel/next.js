/* eslint-env jest */
import { detectContentType, getSharp } from 'next/dist/server/image-optimizer'

const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'
)

describe('getSharp', () => {
  it('should leave the svg loader available to next/og', async () => {
    const sharp = getSharp(null, null)
    const png = await sharp(svg).png().toBuffer()

    expect(await detectContentType(png)).toBe('image/png')
  })
})
