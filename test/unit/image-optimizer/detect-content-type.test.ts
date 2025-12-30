/* eslint-env jest */
import { detectContentType } from 'next/dist/server/image-optimizer'
import { readFile } from 'fs-extra'
import { join } from 'path'

const getImage = (filepath) => readFile(join(__dirname, filepath))

describe.each([false, true])(
  'detectContentType with imgOptSkipMetadata: %s',
  (imgOptSkipMetadata) => {
    it('should return null for empty buffer', async () => {
      expect(await detectContentType(Buffer.alloc(0), imgOptSkipMetadata)).toBe(
        null
      )
    })
    it('should return null for unrecognized buffer', async () => {
      expect(
        await detectContentType(
          Buffer.from([0xa, 0xb, 0xc]),
          imgOptSkipMetadata
        )
      ).toBe(null)
    })
    it('should return jpg', async () => {
      const buffer = await getImage('./images/test.jpg')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/jpeg'
      )
    })
    it('should return png', async () => {
      const buffer = await getImage('./images/test.png')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/png'
      )
    })
    it('should return webp', async () => {
      const buffer = await getImage('./images/animated.webp')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/webp'
      )
    })
    it('should return svg', async () => {
      const buffer = await getImage('./images/test.svg')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/svg+xml'
      )
    })
    it('should return svg for inline svg', async () => {
      const buffer = await getImage('./images/test-inline.svg')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/svg+xml'
      )
    })
    it('should return svg when starts with space', async () => {
      const buffer = Buffer.from(
        ' <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>'
      )
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/svg+xml'
      )
    })
    it('should return svg when starts with newline', async () => {
      const buffer = Buffer.from(
        '\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>'
      )
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/svg+xml'
      )
    })
    it('should return svg when starts with tab', async () => {
      const buffer = Buffer.from(
        '\t<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>'
      )
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/svg+xml'
      )
    })
    it('should return avif', async () => {
      const buffer = await getImage('./images/test.avif')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/avif'
      )
    })
    it('should return icon', async () => {
      const buffer = await getImage('./images/test.ico')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/x-icon'
      )
    })
    it('should return icns', async () => {
      const buffer = await getImage('./images/test.icns')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/x-icns'
      )
    })
    it('should return jxl', async () => {
      const buffer = await getImage('./images/test.jxl')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/jxl'
      )
    })
    it('should return jp2', async () => {
      const buffer = await getImage('./images/test.jp2')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/jp2'
      )
    })
    it('should return heic', async () => {
      const buffer = await getImage('./images/test.heic')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/heic'
      )
    })
    it('should return pdf', async () => {
      const buffer = await getImage('./images/test.pdf')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'application/pdf'
      )
    })
    it('should return tiff', async () => {
      const buffer = await getImage('./images/test.tiff')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/tiff'
      )
    })
    it('should return bmp', async () => {
      const buffer = await getImage('./images/test.bmp')
      expect(await detectContentType(buffer, imgOptSkipMetadata)).toBe(
        'image/bmp'
      )
    })
  }
)
